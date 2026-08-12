export type RosterStudent = {
  id: string;
  name: string;
};

type RosterListener = (students: RosterStudent[]) => void;

const listeners = new Set<RosterListener>();
let students: RosterStudent[] = [];
let persistHandler: ((next: RosterStudent[]) => Promise<void>) | null = null;
let persistChain: Promise<void> = Promise.resolve();

function notify(): void {
  const snapshot = students.map((row) => ({ ...row }));
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeRoster(listener: RosterListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRosterStudents(): RosterStudent[] {
  return students.map((row) => ({ ...row }));
}

export function setRosterPersistHandler(
  handler: ((next: RosterStudent[]) => Promise<void>) | null,
): void {
  persistHandler = handler;
}

async function persist(): Promise<void> {
  if (!persistHandler) return;
  const snapshot = getRosterStudents();
  persistChain = persistChain.then(() => persistHandler?.(snapshot) ?? Promise.resolve()).catch((err) => {
    console.error('[roster-store] persist failed', err);
  });
  await persistChain;
}

export function replaceRoster(next: RosterStudent[], options?: { persist?: boolean }): RosterStudent[] {
  students = next
    .filter((row) => typeof row?.id === 'string' && typeof row?.name === 'string')
    .map((row) => ({ id: row.id, name: row.name.trim() }))
    .filter((row) => row.name);
  notify();
  if (options?.persist !== false) {
    void persist();
  }
  return getRosterStudents();
}

export function clearRoster(options?: { persist?: boolean }): void {
  replaceRoster([], options);
}

function newStudentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `stu_${crypto.randomUUID()}`;
  }
  return `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function addRosterStudent(name: string): Promise<RosterStudent> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('请输入姓名');
  }
  const row = { id: newStudentId(), name: trimmed };
  students = [...students, row];
  notify();
  await persist();
  return { ...row };
}

export async function updateRosterStudent(id: string, name: string): Promise<RosterStudent> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('请输入姓名');
  }
  const index = students.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new Error('未找到该学生');
  }
  const row = { id, name: trimmed };
  students = students.map((item) => (item.id === id ? row : item));
  notify();
  await persist();
  return { ...row };
}

export async function removeRosterStudent(id: string): Promise<void> {
  students = students.filter((row) => row.id !== id);
  notify();
  await persist();
}

export async function importRosterNames(
  names: string[],
  mode: 'append' | 'replace' = 'append',
): Promise<{ count: number; students: RosterStudent[] }> {
  const incoming = names.map((name) => name.trim()).filter(Boolean);
  const rows = incoming.map((name) => ({ id: newStudentId(), name }));
  students = mode === 'replace' ? rows : [...students, ...rows];
  notify();
  await persist();
  return { count: rows.length, students: getRosterStudents() };
}
