import type { ParentProps, JSX } from "solid-js";

interface CardProps extends ParentProps {
  title: string;
  mono?: boolean;
  meta?: string;
  actions?: JSX.Element;
  headerActions?: JSX.Element;
}

export default function Card(props: CardProps) {
  return (
    <div class="card">
      <div class="card-header">
        <h3 class={`card-title${props.mono ? " mono" : ""}`}>{props.title}</h3>
        {props.headerActions}
      </div>
      {props.meta && <div class="card-meta">{props.meta}</div>}
      {props.children}
      {props.actions && <div class="card-actions">{props.actions}</div>}
    </div>
  );
}
