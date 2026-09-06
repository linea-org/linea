# Keep CopilotKit behind the headless end-user interface

Linea's REST protocol and browser-safe client will own end-user approval semantics, with React hooks built on that interface and CopilotKit provided only as an adapter. Making CopilotKit foundational would couple non-chat, non-React, native, and custom applications to a chat framework despite the product goal of letting Operators build arbitrary applications on published workflows.
