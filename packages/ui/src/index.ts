/**
 * ui 公共入口：显式具名导出（禁止裸 export *，避免歧义导出）。
 */
export { setText, applyStates } from './contract.js';
export type { UiController, BaseProps } from './contract.js';
export { createButton } from './primitives/button.js';
export type { ButtonProps, ButtonEvents } from './primitives/button.js';
export { createIcon } from './primitives/icon.js';
export type { IconProps, IconEvents } from './primitives/icon.js';
export { createCheckbox } from './primitives/checkbox.js';
export type { CheckboxProps, CheckboxEvents } from './primitives/checkbox.js';
export { createDialog } from './overlays/dialog.js';
export type { DialogProps, DialogEvents } from './overlays/dialog.js';
export { createToast } from './overlays/toast.js';
export type { ToastProps, ToastEvents } from './overlays/toast.js';
export { createTabs } from './layout/tabs.js';
export type { TabItem, TabsProps, TabsEvents } from './layout/tabs.js';
export { createStack } from './layout/stack.js';
export type { StackProps, StackEvents } from './layout/stack.js';
export { createStatus } from './feedback/status.js';
export type { StatusProps, StatusEvents } from './feedback/status.js';
export { createNumberInput } from './domain-ui/number-input.js';
export type { NumberInputProps, NumberInputEvents } from './domain-ui/number-input.js';
export { createToolGroup } from './domain-ui/tool-group.js';
export type { ToolItem, ToolGroupProps, ToolGroupEvents } from './domain-ui/tool-group.js';
export { createReadoutCard } from './classroom-ui/readout-card.js';
export type { ReadoutRow, ReadoutCardProps, ReadoutCardEvents } from './classroom-ui/readout-card.js';
