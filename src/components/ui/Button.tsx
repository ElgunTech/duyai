import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "primary";
  size?: "md" | "sm";
  icon?: IconName;
  active?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  active,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === "sm" && styles.sm,
    active && styles.active,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  bordered?: boolean;
}

/** Square icon-only button; `label` is used for the tooltip and screen readers. */
export function IconButton({ icon, label, bordered, className, ...rest }: IconButtonProps) {
  const classes = [styles.iconButton, bordered && styles.bordered, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} title={label} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
