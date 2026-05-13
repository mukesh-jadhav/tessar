import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "M3/Button",
  component: Button,
  argTypes: {
    variant: { control: "select", options: ["filled", "tonal", "outlined", "text", "elevated"] },
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
  },
  args: { children: "Run a brief" },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Filled: Story = { args: { variant: "filled" } };
export const Tonal: Story = { args: { variant: "tonal" } };
export const Outlined: Story = { args: { variant: "outlined" } };
export const Text: Story = { args: { variant: "text" } };
export const Elevated: Story = { args: { variant: "elevated" } };

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
        <Button key={s} {...args} size={s}>
          {s.toUpperCase()}
        </Button>
      ))}
    </div>
  ),
};
