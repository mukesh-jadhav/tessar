import type { Meta, StoryObj } from "@storybook/react";

import { IconButton } from "./icon-button";

const meta: Meta<typeof IconButton> = {
  title: "M3/IconButton",
  component: IconButton,
  args: { icon: "favorite", "aria-label": "Favorite" },
  argTypes: {
    variant: { control: "select", options: ["standard", "filled", "tonal", "outlined"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Standard: Story = { args: { variant: "standard" } };
export const Filled: Story = { args: { variant: "filled" } };
export const Tonal: Story = { args: { variant: "tonal" } };
export const Outlined: Story = { args: { variant: "outlined" } };
