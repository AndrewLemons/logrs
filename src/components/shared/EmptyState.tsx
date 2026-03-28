import type { ParentProps } from "solid-js";

interface EmptyStateProps extends ParentProps {
  title: string;
  description?: string;
}

export default function EmptyState(props: EmptyStateProps) {
  return (
    <div class="empty-state">
      <h3>{props.title}</h3>
      {props.description && <p>{props.description}</p>}
      {props.children}
    </div>
  );
}
