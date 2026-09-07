import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { z } from "zod"
import { colors } from "../../theme/colors"

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Enter a workspace name"),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a workspace slug")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
})

type WorkspaceValues = z.infer<typeof workspaceSchema>

export function CreateWorkspaceForm({
  onSubmit,
}: {
  onSubmit: (values: WorkspaceValues) => Promise<void>
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { name: "", slug: "" },
  })
  const submit = handleSubmit(onSubmit)
  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="name"
        render={({ field: { onBlur, onChange, value } }) => (
          <TextInput
            accessibilityLabel="Workspace name"
            autoCapitalize="words"
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="Workspace name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={value}
          />
        )}
      />
      {errors.name ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errors.name.message}
        </Text>
      ) : null}
      <Controller
        control={control}
        name="slug"
        render={({ field: { onBlur, onChange, value } }) => (
          <TextInput
            accessibilityLabel="Workspace slug"
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder="workspace-slug"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={value}
          />
        )}
      />
      {errors.slug ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errors.slug.message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          isSubmitting && styles.buttonDisabled,
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.buttonText}>Create workspace</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderColor: colors.accent,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  error: { color: colors.danger, fontSize: 14 },
  form: { gap: 12 },
  input: {
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
})
