"use client";

import { StatusPill } from "./data-ui";
import { authMethodLabel, type User, type UserRole } from "@/lib/users";

interface UserListProps {
  users: User[];
  /** Guard error from the last role change, if any. */
  roleError: string | null;
  /** Id awaiting remove confirmation, if any. */
  confirmingRemove: string | null;
  /** Guard error from the last remove, if any. */
  removeError: string | null;
  onRoleChange: (id: string, role: UserRole) => void;
  onAskRemove: (id: string) => void;
  onConfirmRemove: (id: string) => void;
  onCancelRemove: () => void;
}

function formatLastLogin(value: string | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function UserList({
  users,
  roleError,
  confirmingRemove,
  removeError,
  onRoleChange,
  onAskRemove,
  onConfirmRemove,
  onCancelRemove,
}: UserListProps) {
  if (users.length === 0) {
    return (
      <p
        className="card p-5 text-sm sm:p-6"
        style={{ color: "var(--color-ink-2)" }}
      >
        No users yet — invite the first teammate above. They appear here
        once invited.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {roleError && (
        <p role="alert" className="flex items-center gap-3 text-sm">
          <StatusPill tone="warn" label="Kept" />
          <span style={{ color: "var(--color-ink-2)" }}>{roleError}</span>
        </p>
      )}
      {removeError && (
        <p role="alert" className="flex items-center gap-3 text-sm">
          <StatusPill tone="warn" label="Kept" />
          <span style={{ color: "var(--color-ink-2)" }}>{removeError}</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="spec-table min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Provider</th>
              <th scope="col">Last login</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isConfirming = confirmingRemove === user.id;
              return (
                <tr key={user.id}>
                  <td>
                    <span className="mono text-sm font-semibold">
                      {user.email}
                    </span>
                  </td>
                  <td className="text-sm">{user.name ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill
                        tone={user.role === "admin" ? "info" : "ok"}
                        label={user.role === "admin" ? "Admin" : "Member"}
                      />
                      <label className="sr-only" htmlFor={`role-${user.id}`}>
                        Role for {user.email}
                      </label>
                      <select
                        id={`role-${user.id}`}
                        className="input w-auto px-2 py-1 text-[13px]"
                        value={user.role}
                        onChange={(event) =>
                          onRoleChange(user.id, event.target.value as UserRole)
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    </div>
                  </td>
                  <td className="text-sm">
                    {user.provider ? authMethodLabel(user.provider) : "—"}
                  </td>
                  <td className="text-sm">{formatLastLogin(user.lastLogin)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {isConfirming ? (
                        <>
                          <button
                            type="button"
                            className="btn-danger px-3 py-1.5 text-sm"
                            onClick={() => onConfirmRemove(user.id)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1.5 text-sm"
                            onClick={onCancelRemove}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-sm"
                          onClick={() => onAskRemove(user.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
