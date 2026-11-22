// "Banco" em memória para o front-end estático.
//
// Cada domínio registra sua coleção com dados iniciais (seed) e expõe funções
// assíncronas em src/lib/services/*. As telas só falam com os services, então
// trocar por uma API real depois é reescrever os services, não as telas.
//
// Os dados persistem no localStorage do navegador; `resetMockData()` volta ao seed.

const STORAGE_PREFIX = "buildflow:mock:";
const LATENCY_MS = 250;

type Doc = { _id: string };

const registry = new Map<string, Collection<Doc>>();

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Simula a latência da rede para os estados de carregamento aparecerem. */
export function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

export class MockError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "MockError";
  }
}

export class Collection<T extends Doc> {
  private items: T[] | null = null;

  constructor(
    public readonly name: string,
    private readonly seed: () => T[],
  ) {}

  private load(): T[] {
    if (this.items) return this.items;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + this.name);
        if (raw) {
          this.items = JSON.parse(raw) as T[];
          return this.items;
        }
      } catch {
        // localStorage indisponível: segue só em memória
      }
    }
    this.items = this.seed();
    return this.items;
  }

  private persist() {
    if (typeof window === "undefined" || !this.items) return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + this.name, JSON.stringify(this.items));
    } catch {
      // ignora quota/privado
    }
  }

  all(): T[] {
    return this.load();
  }

  find(predicate: (item: T) => boolean): T[] {
    return this.load().filter(predicate);
  }

  get(id: string): T | undefined {
    return this.load().find((item) => item._id === id);
  }

  insert(data: Omit<T, "_id"> & { _id?: string }): T {
    const doc = { ...data, _id: data._id ?? newId() } as T;
    this.load().unshift(doc);
    this.persist();
    return doc;
  }

  update(id: string, patch: Partial<T>): T {
    const items = this.load();
    const index = items.findIndex((item) => item._id === id);
    if (index === -1) throw new MockError("Registro não encontrado", 404);
    items[index] = { ...items[index], ...patch, _id: id };
    this.persist();
    return items[index];
  }

  remove(id: string) {
    const items = this.load();
    const index = items.findIndex((item) => item._id === id);
    if (index === -1) throw new MockError("Registro não encontrado", 404);
    items.splice(index, 1);
    this.persist();
  }

  reset() {
    this.items = this.seed();
    this.persist();
  }
}

export function collection<T extends Doc>(name: string, seed: () => T[]): Collection<T> {
  const existing = registry.get(name);
  if (existing) return existing as unknown as Collection<T>;
  const created = new Collection<T>(name, seed);
  registry.set(name, created as unknown as Collection<Doc>);
  return created;
}

export function resetMockData() {
  for (const col of registry.values()) col.reset();
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(key);
    }
  }
}

/** Data relativa a hoje, útil nos seeds: daysAgo(3) → ISO de 3 dias atrás. */
export function daysAgo(days: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function daysFromNow(days: number) {
  return daysAgo(-days);
}
