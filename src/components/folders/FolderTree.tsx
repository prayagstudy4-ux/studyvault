import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import type { Folder as FolderType } from "../../types";
import { cn, folderAncestors } from "../../lib/utils";

interface TreeNode {
  folder: FolderType;
  children: TreeNode[];
}

function buildTree(folders: FolderType[]): TreeNode[] {
  const byParent = new Map<string | null, FolderType[]>();
  for (const f of folders) {
    const key = f.parent_folder_id;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const make = (parentId: string | null, depth: number): TreeNode[] => {
    if (depth > 32) return [];
    const kids = byParent.get(parentId) ?? [];
    return kids
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({ folder, children: make(folder.id, depth + 1) }));
  };
  return make(null, 0);
}

function TreeNodeRow({
  node,
  depth,
  workspaceId,
  currentFolderId,
  expanded,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  workspaceId: string;
  currentFolderId: string | null;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const navigate = useNavigate();
  const active = currentFolderId === node.folder.id;
  const isOpen = expanded.has(node.folder.id);
  const hasKids = node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-2 transition-colors",
          active
            ? "bg-brand-600/12 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            : "text-ink-600 hover:bg-ink-150/70 dark:text-ink-300 dark:hover:bg-ink-800"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <button
          type="button"
          aria-label={hasKids ? `${isOpen ? "Collapse" : "Expand"} ${node.folder.name}` : undefined}
          tabIndex={hasKids ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            if (hasKids) toggle(node.folder.id);
          }}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-400",
            !hasKids && "pointer-events-none opacity-0"
          )}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform duration-150", isOpen && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => navigate(`/workspace/${workspaceId}/folder/${node.folder.id}`)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-[13px] font-medium"
        >
          {active ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-500 dark:text-ink-500" />
          )}
          <span className="truncate">{node.folder.name}</span>
        </button>
      </div>
      {isOpen && hasKids
        ? node.children.map((child) => (
            <TreeNodeRow
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              workspaceId={workspaceId}
              currentFolderId={currentFolderId}
              expanded={expanded}
              toggle={toggle}
            />
          ))
        : null}
    </div>
  );
}

export function FolderTree({
  folders,
  workspaceId,
  currentFolderId,
}: {
  folders: FolderType[];
  workspaceId: string;
  currentFolderId: string | null;
}) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // auto-expand ancestors of the folder being viewed
  useEffect(() => {
    if (!currentFolderId) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const ancestors = folderAncestors(currentFolderId, byId).map((f) => f.id);
    if (ancestors.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [currentFolderId, folders]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (tree.length === 0) {
    return (
      <p className="px-2 py-1 text-xs leading-relaxed text-ink-400 dark:text-ink-500">
        No folders yet. Create one from the browser.
      </p>
    );
  }

  return (
    <nav aria-label="Folder tree" className="space-y-0.5">
      {tree.map((node) => (
        <TreeNodeRow
          key={node.folder.id}
          node={node}
          depth={0}
          workspaceId={workspaceId}
          currentFolderId={currentFolderId}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
    </nav>
  );
}
