import type { Preview } from "@storybook/react";
import { withThemeByDataAttribute } from "@storybook/addon-themes";

import "../app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: { disable: true }, // we paint the surface ourselves
    controls: { expanded: true },
    a11y: { config: { rules: [] } },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
    (Story) => (
      <div className="bg-surface text-on-surface font-sans p-8 min-w-[320px]">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};

export default preview;
