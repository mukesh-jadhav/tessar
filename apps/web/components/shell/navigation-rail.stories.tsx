import type { Meta, StoryObj } from "@storybook/react";

import { NavigationRail } from "./navigation-rail";

const meta: Meta<typeof NavigationRail> = {
  title: "Shell/NavigationRail",
  component: NavigationRail,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
};
export default meta;

type Story = StoryObj<typeof NavigationRail>;

export const Default: Story = {};
