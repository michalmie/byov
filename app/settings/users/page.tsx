"use client";

import { useState } from "react";
import { ControlPlaneShell } from "@/components/shell";
import { StatusPill } from "@/components/data-ui";
import { UserList } from "@/components/user-list";
import { SettingsSubnav } from "@/components/settings-subnav";
import { useUsers } from "@/lib/users-store";
import type { UserRole } from "@/lib/users";

export default function SettingsUsers() {
  const { users, invite, changeRole, remove } = useUsers();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const admins = users.filter((user) => user.role === "admin").length;
  const countSummary =
    users.length === 0
      ? "No users yet."
      : `${users.length} ${users.length === 1 ? "user" : "users"} · ${admins} ${admins === 1 ? "admin" : "admins"}`;

  function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    const error = invite(email, role);
    if (error) {
      setInviteError(error);
      return;
    }
    setEmail("");
    setRole("member");
    setInviteError(null);
    setNotice("Invite added — the address joins the workspace list.");
  }

  function handleRoleChange(id: string, next: UserRole) {
    const error = changeRole(id, next);
    if (error) {
      setRoleError(error);
      return;
    }
    setRoleError(null);
    setNotice("Role updated.");
  }

  function handleConfirmRemove(id: string) {
    const error = remove(id);
    setConfirmingRemove(null);
    if (error) {
      setRemoveError(error);
      return;
    }
    setRemoveError(null);
    setNotice("User removed.");
  }

  return (
    <ControlPlaneShell crumb="Settings / Users" subnav={<SettingsSubnav />}>
      <div className="grid gap-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p
            className="mt-2 max-w-[65ch] text-sm"
            style={{ color: "var(--color-muted)" }}
          >
            Who belongs to this workspace and what they may do. The list
            stays in this browser until the API lands. Server-side, the
            first user to sign in becomes admin unless admins are
            configured (AUTH_ADMIN_EMAILS).
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-ink-2)" }}
          >
            {countSummary}
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-3 text-sm">
            <StatusPill tone="ok" label="Saved" />
            <span style={{ color: "var(--color-ink-2)" }}>{notice}</span>
          </p>
        )}

        <section
          aria-labelledby="invite-heading"
          className="card grid gap-6 p-5 sm:p-6"
        >
          <div className="max-w-2xl">
            <h2
              id="invite-heading"
              className="text-xl font-semibold tracking-tight"
            >
              Invite
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-ink-2)" }}
            >
              Add an address to the workspace list with its starting role.
            </p>
          </div>
          <form
            onSubmit={handleInvite}
            noValidate
            className="grid gap-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          >
            <div className="field">
              <label className="field-label" htmlFor="invite-email">
                Email
              </label>
              <input
                id="invite-email"
                className="input max-w-md"
                type="email"
                autoComplete="off"
                placeholder="ada@example.com"
                value={email}
                aria-invalid={Boolean(inviteError)}
                aria-describedby={inviteError ? "invite-email-error" : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setInviteError(null);
                  setNotice(null);
                }}
              />
              {inviteError && (
                <p id="invite-email-error" className="form-error">
                  {inviteError}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="invite-role">
                Role
              </label>
              <select
                id="invite-role"
                className="input"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn-primary px-3 py-1.5 text-[13px]">
              Invite
            </button>
          </form>
        </section>

        <UserList
          users={users}
          roleError={roleError}
          confirmingRemove={confirmingRemove}
          removeError={removeError}
          onRoleChange={handleRoleChange}
          onAskRemove={(id) => {
            setConfirmingRemove(id);
            setRemoveError(null);
            setNotice(null);
          }}
          onConfirmRemove={handleConfirmRemove}
          onCancelRemove={() => setConfirmingRemove(null)}
        />
      </div>
    </ControlPlaneShell>
  );
}
