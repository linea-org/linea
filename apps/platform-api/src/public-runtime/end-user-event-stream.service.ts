import { HttpException, Injectable } from '@nestjs/common'
import { db, repositories, type OutboxMessage } from '@linea/db'
import { publicErrorStatuses } from '@linea/protocol/errors'
import type { EventEnvelope, EventStreamQuery } from '@linea/protocol/events'
import type { Request, Response } from 'express'
import { publicError } from '../auth/public-error'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const STREAM_LEASE_MS = 30_000
const LEASE_RENEWAL_INTERVAL_MS = 10_000
const POLL_INTERVAL_MS = 1_000
const KEEPALIVE_INTERVAL_MS = 15_000
const PAGE_SIZE = 100
const MAXIMUM_STREAMS = 3

@Injectable()
export class EndUserEventStreamService {
  async open(
    principal: EndUserPrincipal,
    query: EventStreamQuery,
    afterEventId: string | undefined,
    request: Request,
    response: Response,
  ): Promise<void> {
    let result = await this.list(principal, query, afterEventId)
    if (result.outcome === 'cursor_expired') this.cursorExpired()
    const now = new Date()
    const stream = await repositories.endUserEvent.acquireEndUserEventStream(
      db,
      {
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        externalSubjectId: principal.externalSubjectId,
        sessionId: principal.sessionId,
        now,
        leaseExpiresAt: new Date(now.getTime() + STREAM_LEASE_MS),
        maximumStreams: MAXIMUM_STREAMS,
      },
    )
    if (!stream) {
      throw new HttpException(
        publicError('rate_limited', 'Too many active event streams'),
        publicErrorStatuses.rate_limited,
      )
    }
    let closed = false
    const close = () => {
      closed = true
    }
    request.once('close', close)
    response.once('close', close)
    response.status(200)
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()
    response.write(': connected\n\n')
    let cursor = afterEventId
    let lastKeepalive = Date.now()
    let nextRenewalAt = Date.now() + LEASE_RENEWAL_INTERVAL_MS
    const renew = async (force: boolean) => {
      const now = Date.now()
      if (!force && now < nextRenewalAt) return true
      const renewedAt = new Date(now)
      const renewed = await repositories.endUserEvent.renewEndUserEventStream(
        db,
        {
          streamId: stream.id,
          sessionId: principal.sessionId,
          now: renewedAt,
          leaseExpiresAt: new Date(renewedAt.getTime() + STREAM_LEASE_MS),
        },
      )
      if (renewed) nextRenewalAt = Date.now() + LEASE_RENEWAL_INTERVAL_MS
      return renewed
    }
    try {
      while (!closed) {
        for (const event of result.events) {
          if (closed) break
          if (!(await renew(false))) {
            closed = true
            break
          }
          if (!(await this.write(response, this.serialize(event), renew))) {
            closed = true
            break
          }
          cursor = event.id
        }
        if (closed) break
        if (result.events.length < PAGE_SIZE) {
          if (Date.now() - lastKeepalive >= KEEPALIVE_INTERVAL_MS) {
            if (!(await this.write(response, ': keepalive\n\n', renew))) break
            lastKeepalive = Date.now()
          }
          await this.wait(request)
          if (closed) break
          if (!(await renew(true))) break
        } else if (!(await renew(true))) {
          break
        }
        result = await this.list(principal, query, cursor)
        if (result.outcome === 'cursor_expired') break
      }
    } finally {
      request.off('close', close)
      response.off('close', close)
      await repositories.endUserEvent.releaseEndUserEventStream(
        db,
        stream.id,
        principal.sessionId,
      )
      if (!response.writableEnded) response.end()
    }
  }

  private list(
    principal: EndUserPrincipal,
    query: EventStreamQuery,
    afterEventId: string | undefined,
  ) {
    return repositories.endUserEvent.listEndUserEvents(db, {
      workspaceId: principal.workspaceId,
      applicationId: principal.applicationId,
      externalSubjectId: principal.externalSubjectId,
      conversationId: query.conversationId,
      eventTypes: query.eventType,
      afterEventId,
      retainedAfter: new Date(Date.now() - RETENTION_MS),
      limit: PAGE_SIZE,
    })
  }

  private serialize(message: OutboxMessage): string {
    if (!message.applicationId || !message.eventType) {
      throw new Error('Public event outbox message is incomplete')
    }
    const envelope: EventEnvelope = {
      id: message.id,
      type: message.eventType,
      version: 1,
      createdAt: message.createdAt.toISOString(),
      applicationId: message.applicationId,
      data: message.payload,
    }
    return `id: ${envelope.id}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`
  }

  private async write(
    response: Response,
    content: string,
    renew: (force: boolean) => Promise<boolean>,
  ): Promise<boolean> {
    if (response.write(content)) return true
    while (!response.writableEnded) {
      const outcome = await this.waitForWritable(response)
      if (outcome === 'drain') return true
      if (outcome === 'close' || !(await renew(true))) return false
    }
    return false
  }

  private waitForWritable(
    response: Response,
  ): Promise<'drain' | 'close' | 'renew'> {
    return new Promise((resolve) => {
      const finish = (outcome: 'drain' | 'close' | 'renew') => {
        clearTimeout(timeout)
        response.off('drain', drained)
        response.off('close', closed)
        resolve(outcome)
      }
      const drained = () => finish('drain')
      const closed = () => finish('close')
      const timeout = setTimeout(
        () => finish('renew'),
        LEASE_RENEWAL_INTERVAL_MS,
      )
      response.once('drain', drained)
      response.once('close', closed)
      if (response.writableEnded) finish('close')
    })
  }

  private wait(request: Request): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timeout)
        request.off('close', done)
        resolve()
      }
      const timeout = setTimeout(done, POLL_INTERVAL_MS)
      request.once('close', done)
      if (request.destroyed) done()
    })
  }

  private cursorExpired(): never {
    throw new HttpException(
      publicError('event_cursor_expired', 'Event cursor expired'),
      publicErrorStatuses.event_cursor_expired,
    )
  }
}
