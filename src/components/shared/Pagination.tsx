import { Show } from "solid-js";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function Pagination(props: PaginationProps) {
  return (
    <Show when={props.totalPages > 1}>
      <div class="pagination">
        <button
          class="btn btn-sm btn-secondary"
          disabled={props.page <= 1}
          onClick={props.onPrev}
        >
          ← Prev
        </button>
        <span>Page {props.page} of {props.totalPages}</span>
        <button
          class="btn btn-sm btn-secondary"
          disabled={props.page >= props.totalPages}
          onClick={props.onNext}
        >
          Next →
        </button>
      </div>
    </Show>
  );
}
