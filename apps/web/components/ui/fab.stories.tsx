import type { Meta, StoryObj } from "@storybook/react";

import { Fab } from "./fab";

const meta: Meta<typeof Fab> = {
  title: "M3/Fab",
  component: Fab,
  args: { icon: "add", "aria-label": "Add" },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "tertiary", "surface"] },
    size: { control: "select", options: ["sm", "md", "lg", "extended"] },
  },
};
export default meta;

type Story = StoryObj<typeof Fab>;

export const Primary: Story = { args: { variant: "primary", size: "md" } };
export const Large: Story = { args: { variant: "primary", size: "lg" } };
export const Extended: Story = {
  args: { variant: "primary", size: "extended", label: "New brief" },
};
