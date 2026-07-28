import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    children: "保存",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "次要操作" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost", children: "取消" } };
export const Success: Story = { args: { variant: "success", children: "确认完成" } };
export const Warning: Story = { args: { variant: "warning", children: "需要处理" } };
export const Destructive: Story = { args: { variant: "destructive", children: "删除" } };
