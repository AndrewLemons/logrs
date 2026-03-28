import type { ParentProps } from "solid-js";

interface PageHeaderProps extends ParentProps {
  title: string;
}

export default function PageHeader(props: PageHeaderProps) {
  return (
    <div class="page-header">
      <h1>{props.title}</h1>
      {props.children}
    </div>
  );
}
