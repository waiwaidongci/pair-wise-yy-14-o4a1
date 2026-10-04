// 共享 UI 小组件
import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "accent";
}) {
  const tones: Record<string, string> = {
    default: "badge-default",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    accent: "badge-accent",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="panel-head">
          <div>
            {subtitle && <p className="panel-sub">{subtitle}</p>}
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger" | "success";
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
