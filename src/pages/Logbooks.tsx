import { createSignal, createResource, Show, For, onMount, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-solid";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { addToast, setActiveLogbook, setActiveTemplate } from "../stores/app";
import { on, emit, Events } from "../stores/events";
import Modal from "../components/shared/Modal";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import Card from "../components/shared/Card";
import type { Logbook, CreateLogbook, Template, Profile } from "../types";

export default function Logbooks() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = createSignal(false);
  const [name, setName] = createSignal("");
  const [templateId, setTemplateId] = createSignal(1);
  const [profileId, setProfileId] = createSignal(0);
  const [metadata] = createSignal("");

  const [logbooks, { refetch }] = createResource(() =>
    invoke<Logbook[]>("get_logbooks")
  );
  const [templates] = createResource(() =>
    invoke<Template[]>("get_templates")
  );
  const [profiles] = createResource(() =>
    invoke<Profile[]>("get_profiles")
  );

  // Listen for external changes
  let unsub: (() => void) | undefined;
  onMount(() => { unsub = on(Events.LOGBOOKS_CHANGED, refetch); });
  onCleanup(() => unsub?.());

  async function createLogbook() {
    if (!name().trim()) {
      addToast("Enter a logbook name", "error");
      return;
    }
    if (!profileId()) {
      addToast("Select a profile", "error");
      return;
    }
    try {
      const lb = await invoke<Logbook>("create_logbook", {
        logbook: {
          name: name().trim(),
          profile_id: profileId(),
          template_id: templateId(),
          metadata_json: metadata() || "{}",
        } satisfies CreateLogbook,
      });
      addToast(`Created logbook: ${lb.name}`, "success");
      setShowCreate(false);
      setName("");
      refetch();
      emit(Events.LOGBOOKS_CHANGED);
    } catch (err) {
      addToast(`Error: ${err}`, "error");
    }
  }

  async function deleteLogbook(id: number, lbName: string) {
    if (!(await confirm(`Delete logbook "${lbName}"? All QSOs will be deleted.`, { title: "Delete Logbook", kind: "warning" }))) return;
    try {
      await invoke("delete_logbook", { id });
      addToast(`Deleted: ${lbName}`, "success");
      refetch();
      emit(Events.LOGBOOKS_CHANGED);
    } catch (err) {
      addToast(`Error: ${err}`, "error");
    }
  }

  async function setActiveLogbookAction(lb: Logbook) {
    try {
      await invoke("set_active_logbook", { id: lb.id });
      setActiveLogbook(lb);
      const template = await invoke<Template>("get_template", { id: lb.template_id });
      setActiveTemplate(template);
      addToast(`Active: ${lb.name}`, "success");
      emit(Events.LOGBOOKS_CHANGED);
    } catch (err) {
      addToast(`Error: ${err}`, "error");
    }
  }

  async function openLogbook(lb: Logbook) {
    await setActiveLogbookAction(lb);
    navigate("/");
  }

  async function importAdif(logbookId: number) {
    const path = await open({
      filters: [{ name: "ADIF", extensions: ["adi", "adif"] }],
    });
    if (!path) return;
    try {
      const count = await invoke<number>("import_adif", {
        logbookId,
        path,
      });
      addToast(`Imported ${count} QSOs`, "success");
    } catch (err) {
      addToast(`Import error: ${err}`, "error");
    }
  }

  function templateName(tid: number): string {
    return templates()?.find((t) => t.id === tid)?.name ?? "Unknown";
  }

  return (
    <div>
      <PageHeader title="Logbooks">
        <button class="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Logbook
        </button>
      </PageHeader>

      <Show when={!logbooks()?.length}>
        <EmptyState title="No Logbooks" description="Create your first logbook to start logging contacts.">
          <button class="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Create Logbook
          </button>
        </EmptyState>
      </Show>

      <div class="card-grid">
        <For each={logbooks()}>
          {(lb) => (
            <Card
              title={lb.name}
              meta={`Template: ${templateName(lb.template_id)} · Created: ${lb.created_at.slice(0, 10)}`}
              headerActions={
                <button class="btn-icon" onClick={() => deleteLogbook(lb.id, lb.name)} title="Delete">
                  <Trash2 size={14} />
                </button>
              }
              actions={
                <>
                  <button class="btn btn-primary btn-sm" onClick={() => setActiveLogbookAction(lb)}>
                    Set Active
                  </button>
                  <button class="btn btn-secondary btn-sm" onClick={() => openLogbook(lb)}>
                    Open
                  </button>
                  <button class="btn btn-secondary btn-sm" onClick={() => importAdif(lb.id)}>
                    Import ADIF
                  </button>
                </>
              }
            />
          )}
        </For>
      </div>

      <Modal open={showCreate()} onClose={() => setShowCreate(false)} title="New Logbook">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input class="form-input" type="text" value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="POTA K-1234 Activation" />
          </div>
          <div class="form-group">
            <label class="form-label">Profile</label>
            <select class="form-select" value={profileId()}
              onChange={(e) => setProfileId(parseInt(e.currentTarget.value))}>
              <option value={0}>Select profile...</option>
              <For each={profiles()}>
                {(p) => <option value={p.id}>{p.callsign} — {p.name}</option>}
              </For>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Template</label>
            <select class="form-select" value={templateId()}
              onChange={(e) => setTemplateId(parseInt(e.currentTarget.value))}>
              <For each={templates()}>
                {(t) => <option value={t.id}>{t.name}</option>}
              </For>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={createLogbook}>Create</button>
        </div>
      </Modal>
    </div>
  );
}
