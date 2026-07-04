import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

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

export default function App() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isRefetching, setIsRefetching] = useState(false);
  const [refetchError, setRefetchError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Feed[]>("get_feeds")
      .then((data) => {
        setFeeds(data);
        setSelectedFeedId((current) => current ?? data[0]?.id ?? null);
      })
      .catch(() => {
        setFeeds([]);
        setSelectedFeedId(null);
      });
  }, []);

  useEffect(() => {
    if (!selectedFeedId) {
      setEntries([]);
      return;
    }

    invoke<FeedEntry[]>("get_entries", { id: selectedFeedId })
      .then((data) => {
        setEntries(data);
      })
      .catch(() => setEntries([]));
  }, [selectedFeedId]);

  async function handleRefetch() {
    setIsRefetching(true);
    setRefetchError(null);

    try {
      const result = (await invoke("refetch")) as RefetchResponse;
      if (result.failed.length > 0) {
        setRefetchError(`Failed: ${result.failed.join(", ")}`);
      }

      if (selectedFeedId) {
        const data = await invoke("entries", { id: selectedFeedId });
        setEntries(data as FeedEntry[]);
      }
    } catch {
      setRefetchError("Refetch failed");
    } finally {
      setIsRefetching(false);
    }
  }

  return (
    <div className="flex h-screen">
      <div className="flex w-64 flex-col border-mist-200 border-r bg-mist-100 shadow">
        {feeds.map((feed) => {
          return (
            <button
              key={feed.id}
              className="p-2 text-left hover:bg-mist-200"
              onClick={() => setSelectedFeedId(feed.id)}
            >
              {feed.name}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              className="rounded-md bg-mist-800 px-4 py-2 text-mist-100 disabled:opacity-50"
              onClick={handleRefetch}
              disabled={isRefetching}
            >
              {isRefetching ? "Refetching..." : "Refetch"}
            </button>
            {refetchError ? (
              <p className="text-red-600 text-sm">{refetchError}</p>
            ) : null}
          </div>
          {entries.map((entry, index) => {
            return (
              <a
                href={entry.links[0] ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                key={index}
                className="group flex gap-4 border-mist-400"
              >
                {entry.thumbnails[0] && (
                  <img
                    src={entry.thumbnails[0]}
                    className="rounded-lg border border-mist-200 shadow-lg"
                  />
                )}
                <div>
                  <h2 className="mb-2 font-bold text-2xl transition-colors duration-75 group-hover:text-blue-500">
                    {entry.title}
                  </h2>
                  {entry.description ? (
                    <p className="text-mist-800">{entry.description}</p>
                  ) : null}
                </div>{" "}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
