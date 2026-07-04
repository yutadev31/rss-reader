import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

type Feed = {
  id: string;
  name: string;
  url: string;
};

type FeedEntry = {
  title: string;
  description: string | null;
  links: string[];
  thumbnails: string[];
  published: string | null;
  updated: string | null;
};

type RefetchResponse = {
  refreshed: string[];
  failed: string[];
};

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "rss-reader-theme";

function formatDate(value: string | null) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compactText(value: string | null, maxLength = 220) {
  if (!value) {
    return null;
  }

  const plainText = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plainText) {
    return null;
  }

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength).trimEnd()}...`;
}

export default function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [refetchError, setRefetchError] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    setIsLoadingFeeds(true);

    invoke<Feed[]>("get_feeds")
      .then((data) => {
        setFeeds(data);
        setSelectedFeedId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => {
        setFeeds([]);
        setSelectedFeedId(null);
        setFeedError("Failed to load feeds.");
      })
      .finally(() => setIsLoadingFeeds(false));
  }, []);

  useEffect(() => {
    if (!selectedFeedId) {
      setEntries([]);
      return;
    }

    setIsLoadingEntries(true);

    invoke<FeedEntry[]>("get_entries", { id: selectedFeedId })
      .then((data) => {
        setEntries(data);
      })
      .catch(() => setEntries([]))
      .finally(() => setIsLoadingEntries(false));
  }, [selectedFeedId]);

  async function handleRefetch() {
    setIsRefetching(true);
    setRefetchError(null);

    try {
      const result = (await invoke("refetch")) as RefetchResponse | null;

      if (!result) {
        throw new Error("Refetch failed");
      }

      if (result.failed.length > 0) {
        setRefetchError(`Failed: ${result.failed.join(", ")}`);
      }

      if (selectedFeedId) {
        const data = await invoke<FeedEntry[]>("get_entries", {
          id: selectedFeedId,
        });
        setEntries(data);
      }
    } catch {
      setRefetchError("Refetch failed");
    } finally {
      setIsRefetching(false);
    }
  }

  const selectedFeed = useMemo(
    () => feeds.find((feed) => feed.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId],
  );

  return (
    <div
      data-theme={themeMode}
      className="app-theme min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]"
    >
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-[var(--app-border)] border-b bg-[var(--app-sidebar)] lg:border-r lg:border-b-0">
          <div className="flex h-full flex-col px-5 py-6 lg:px-6 lg:py-8">
            <div className="mb-8">
              <p className="mb-3 font-semibold text-[0.7rem] text-[var(--app-accent)] uppercase tracking-[0.28em]">
                RSS Reader
              </p>
              <h1 className="font-display font-semibold text-3xl leading-tight">
                Feed Overview
              </h1>
              <p className="mt-3 max-w-xs text-[var(--app-text-muted)] text-sm leading-6">
                A simple reading view for tracking updates across your feeds.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
                <p className="text-[0.68rem] text-[var(--app-text-subtle)] uppercase tracking-[0.2em]">
                  Feeds
                </p>
                <p className="mt-2 font-semibold text-3xl">{feeds.length}</p>
              </div>
              <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
                <p className="text-[0.68rem] text-[var(--app-text-subtle)] uppercase tracking-[0.2em]">
                  Stories
                </p>
                <p className="mt-2 font-semibold text-3xl">{entries.length}</p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <p className="font-medium text-[var(--app-text-subtle)] text-xs uppercase tracking-[0.24em]">
                Sources
              </p>
              {isLoadingFeeds ? (
                <span className="text-[var(--app-text-subtle)] text-xs">
                  Loading...
                </span>
              ) : null}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {feeds.map((feed) => {
                const isActive = feed.id === selectedFeedId;

                return (
                  <button
                    key={feed.id}
                    type="button"
                    className={[
                      "w-full border px-4 py-3 text-left transition-colors duration-150",
                      isActive
                        ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-contrast)]"
                        : "border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-muted)]",
                    ].join(" ")}
                    onClick={() => setSelectedFeedId(feed.id)}
                  >
                    <p className="font-medium text-sm">{feed.name}</p>
                    <p
                      className={[
                        "mt-1 text-xs",
                        isActive
                          ? "text-[color:var(--app-accent-muted-contrast)]"
                          : "text-[var(--app-text-subtle)]",
                      ].join(" ")}
                    >
                      {feed.url}
                    </p>
                  </button>
                );
              })}

              {!isLoadingFeeds && feeds.length === 0 ? (
                <div className="border border-[var(--app-border-strong)] border-dashed bg-[var(--app-surface-muted)] px-4 py-6 text-[var(--app-text-muted)] text-sm">
                  {feedError ?? "No feeds configured."}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="bg-[var(--app-bg)]">
          <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
            <header className="mb-6 border border-[var(--app-border)] bg-[var(--app-surface)] p-5 md:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="font-medium text-[0.72rem] text-[var(--app-text-subtle)] uppercase tracking-[0.24em]">
                    Current Feed
                  </p>
                  <h2 className="mt-3 font-semibold text-3xl leading-tight sm:text-4xl">
                    {selectedFeed?.name ?? "Pick a source"}
                  </h2>
                  <p className="mt-3 max-w-2xl text-[var(--app-text-muted)] text-sm leading-6 sm:text-base">
                    {selectedFeed?.url ??
                      "Choose a feed from the left to open the latest entries in a calmer reading layout."}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-2 font-medium text-[var(--app-text-muted)] text-xs uppercase tracking-[0.18em] transition-colors hover:border-[var(--app-border-strong)]"
                    onClick={() =>
                      setThemeMode((current) =>
                        current === "light" ? "dark" : "light",
                      )
                    }
                  >
                    {themeMode === "light" ? "Dark mode" : "Light mode"}
                  </button>
                  <div className="border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-2 font-medium text-[var(--app-text-muted)] text-xs uppercase tracking-[0.18em]">
                    {entries.length} items
                  </div>
                  <button
                    type="button"
                    className="border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 font-medium text-[var(--app-accent-contrast)] transition-colors hover:bg-[var(--app-accent-hover)] disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={handleRefetch}
                    disabled={isRefetching}
                  >
                    {isRefetching ? "Refreshing..." : "Refresh all feeds"}
                  </button>
                </div>
              </div>

              {refetchError ? (
                <p className="mt-4 border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] px-4 py-3 text-[var(--app-danger-text)] text-sm">
                  {refetchError}
                </p>
              ) : null}
            </header>

            <section className="flex-1">
              {isLoadingEntries ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="min-h-56 animate-pulse border border-[var(--app-border)] bg-[var(--app-surface)]"
                    />
                  ))}
                </div>
              ) : null}

              {!isLoadingEntries && entries.length > 0 ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  {entries.map((entry, index) => {
                    const thumbnail = entry.thumbnails[0];
                    const publishedLabel = formatDate(
                      entry.published ?? entry.updated,
                    );
                    const summary = compactText(entry.description);

                    return (
                      <a
                        href={entry.links[0] ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        key={`${entry.title}-${index}`}
                        className="group border border-[var(--app-border)] bg-[var(--app-surface)] p-4 transition-colors duration-150 hover:border-[var(--app-accent)] sm:p-5"
                      >
                        <div className="flex h-full flex-col gap-5">
                          {thumbnail ? (
                            <div className="overflow-hidden bg-[var(--app-surface-muted)]">
                              <img
                                src={thumbnail}
                                alt=""
                                className="h-52 w-full object-cover"
                              />
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between gap-4 text-[var(--app-text-subtle)] text-xs uppercase tracking-[0.18em]">
                            <span>{publishedLabel}</span>
                            <span className="border border-[var(--app-border)] px-3 py-1">
                              Open article
                            </span>
                          </div>

                          <div className="space-y-3">
                            <h3 className="font-semibold text-2xl leading-tight group-hover:text-[var(--app-accent-hover)] sm:text-[1.8rem]">
                              {entry.title}
                            </h3>
                            {summary ? (
                              <p className="text-[var(--app-text-muted)] text-sm leading-7 sm:text-[0.96rem]">
                                {summary}
                              </p>
                            ) : (
                              <p className="text-[var(--app-text-subtle)] text-sm leading-7">
                                No summary available for this entry.
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : null}

              {!isLoadingEntries && selectedFeed && entries.length === 0 ? (
                <div className="flex min-h-[360px] items-center justify-center border border-[var(--app-border-strong)] border-dashed bg-[var(--app-surface)] p-8 text-center">
                  <div className="max-w-md">
                    <p className="font-medium text-[0.72rem] text-[var(--app-text-subtle)] uppercase tracking-[0.24em]">
                      No Entries
                    </p>
                    <h3 className="mt-3 font-semibold text-3xl">
                      Nothing to read yet
                    </h3>
                    <p className="mt-4 text-[var(--app-text-muted)] text-sm leading-7">
                      This feed returned no cached or fresh entries. Try
                      refreshing all feeds and check the source URL if it stays
                      empty.
                    </p>
                  </div>
                </div>
              ) : null}

              {!isLoadingEntries && !selectedFeed ? (
                <div className="flex min-h-[360px] items-center justify-center border border-[var(--app-border-strong)] border-dashed bg-[var(--app-surface)] p-8 text-center">
                  <div className="max-w-md">
                    <p className="font-medium text-[0.72rem] text-[var(--app-text-subtle)] uppercase tracking-[0.24em]">
                      Waiting
                    </p>
                    <h3 className="mt-3 font-semibold text-3xl">
                      Select a feed
                    </h3>
                    <p className="mt-4 text-[var(--app-text-muted)] text-sm leading-7">
                      Your feed list lives in the left rail. Pick one to load
                      the latest entries.
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
