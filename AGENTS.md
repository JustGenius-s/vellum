# Vellum Agent Rules

## Frontend component policy

- Before implementing any UI primitive, layout behavior, or interaction, first inspect `src/components/ui`, `components.json`, and the official shadcn/ui component registry and documentation.
- When shadcn/ui provides a suitable component, install or update it through the shadcn CLI and compose that component. Do not create a parallel custom implementation.
- Feature code must import UI components and any exposed helpers through `src/components/ui`. Do not bypass that boundary by importing a shadcn component's backing primitive package directly.
- A custom UI primitive is allowed only when no suitable shadcn/ui component exists or a documented product requirement cannot be met through composition. State the reason before implementing it, and build on the existing shadcn/Radix primitives where possible.
- Prefer existing project components over adding another dependency or duplicating behavior.
- Use the native shadcn neutral semantic tokens. Do not introduce a separate application color palette.
- Before adding or configuring React, Vite+, shadcn/ui, Tailwind CSS, Radix, or another framework/library, read its current official documentation and follow the documented setup and API.
- Verify dependencies in `package.json` before importing them. Use `pnpm` and keep `pnpm-lock.yaml` synchronized.

## Verification

- Run `pnpm exec vp check`, `pnpm exec vp test`, `pnpm run build`, and `git diff --check` after frontend changes.
- For interaction or responsive-layout changes, verify the behavior in the running application at the relevant breakpoints.
