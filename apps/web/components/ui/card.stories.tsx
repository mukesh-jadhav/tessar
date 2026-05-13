import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./button";
import { Card, CardActions, CardBody, CardDescription, CardHeader, CardTitle } from "./card";

const meta: Meta<typeof Card> = {
  title: "M3/Card",
  component: Card,
  argTypes: {
    variant: { control: "select", options: ["elevated", "filled", "outlined"] },
    interactive: { control: "boolean" },
  },
};
export default meta;

type Story = StoryObj<typeof Card>;

const Demo = (variant: "elevated" | "filled" | "outlined") => (
  <Card variant={variant} className="w-80">
    <CardHeader>
      <CardTitle>Synthesizer</CardTitle>
      <CardDescription>Tier-A model · 4 sources cited</CardDescription>
    </CardHeader>
    <CardBody>
      Recommends Cloud Run for stateless web tier with Cloud SQL Postgres for relational + vector storage.
    </CardBody>
    <CardActions>
      <Button variant="text" size="xs">Open</Button>
      <Button variant="filled" size="xs">Approve</Button>
    </CardActions>
  </Card>
);

export const Elevated: Story = { render: () => Demo("elevated") };
export const Filled: Story = { render: () => Demo("filled") };
export const Outlined: Story = { render: () => Demo("outlined") };
