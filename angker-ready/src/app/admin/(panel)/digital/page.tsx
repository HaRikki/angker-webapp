"use client";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  stock: number;
  delivery: string;
  description: string;
  active: boolean;
  sort: number;
  codesTotal: number;
  ordersTotal: number;
};

const empty = {
  name: "",
  price: 1,
  emoji: "💎",
  stock: 0,
  delivery: "Instant",
  description: "",
  active: true,
  sort: 0,
  codes: "",
};

export default function AdminDigitalPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch("/api/admin/digital-products");
    const j = await r.json();
    if (j.ok) setItems(j.data.items);
    else setMsg(j.error || "Load failed");
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const body = editId
        ? { id: editId, ...form }
        : { ...form };
      const r = await fetch("/api/admin/digital-products", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      setForm({ ...empty });
      setEditId(null);
      setMsg(editId ? "Updated" : "Created");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const r = await fetch(`/api/admin/digital-products?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.ok) setMsg(j.error || "Delete failed");
    else {
      setMsg("Deleted");
      load();
    }
  };

  const startEdit = (it: Item) => {
    setEditId(it.id);
    setForm({
      name: it.name,
      price: it.price,
      emoji: it.emoji,
      stock: it.stock,
      delivery: it.delivery,
      description: it.description,
      active: it.active,
      sort: it.sort,
      codes: "",
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🛒 Digital products</h1>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border px-3 py-1.5 text-sm"
        >
          Refresh
        </button>
      </div>

      {msg && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-200">
          {msg}
        </div>
      )}

      <div className="grid gap-4 rounded-2xl border bg-white p-4 dark:bg-zinc-900 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-semibold">{editId ? "Edit product" : "Add product"}</h2>
          {(
            [
              ["name", "Name", "text"],
              ["emoji", "Emoji", "text"],
              ["price", "Price (USD)", "number"],
              ["stock", "Stock", "number"],
              ["delivery", "Delivery", "text"],
              ["sort", "Sort", "number"],
            ] as const
          ).map(([k, label, type]) => (
            <label key={k} className="block text-sm">
              <span className="text-zinc-500">{label}</span>
              <input
                type={type}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={(form as any)[k]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [k]: type === "number" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-zinc-500">Description (one line per bullet)</span>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-500">
              Add codes / accounts (one per line) — increases stock
            </span>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs"
              rows={5}
              placeholder={"user:pass\ncode-xxx\n..."}
              value={form.codes}
              onChange={(e) => setForm({ ...form, codes: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "…" : editId ? "Update" : "Create"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setForm({ ...empty });
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Price</th>
                <th className="py-2 pr-2">Stock</th>
                <th className="py-2 pr-2">Codes</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-2">
                    <span className="mr-1">{it.emoji}</span>
                    {it.name}
                    {!it.active && (
                      <span className="ml-1 text-xs text-rose-500">off</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">${it.price}</td>
                  <td className="py-2 pr-2 tabular-nums">{it.stock}</td>
                  <td className="py-2 pr-2 tabular-nums">{it.codesTotal}</td>
                  <td className="py-2 space-x-2">
                    <button
                      type="button"
                      className="text-blue-600"
                      onClick={() => startEdit(it)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-rose-600"
                      onClick={() => remove(it.id)}
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-400">
                    No digital products yet. Create one on the left.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
