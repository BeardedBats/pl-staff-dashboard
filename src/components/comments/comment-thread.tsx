"use client";

import * as React from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/users/user-avatar";
import { CommentBody } from "./comment-body";
import { CommentComposer } from "./comment-composer";
import type { CommentRecord } from "@/lib/comments/data";

type CommentThreadProps = {
  entryId: string;
  currentUserId: string;
  isAdmin: boolean;
};

export function CommentThread({
  entryId,
  currentUserId,
  isAdmin,
}: CommentThreadProps) {
  const [comments, setComments] = React.useState<CommentRecord[] | null>(null);
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const res = await fetch(`/api/entries/${entryId}/comments`);
    const data = (await res.json()) as { comments: CommentRecord[] };
    setComments(data.comments ?? []);
  }, [entryId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  if (comments === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-zero" />
      </div>
    );
  }

  async function submitNew(body: string) {
    const res = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) await reload();
    return res.ok;
  }

  async function submitReply(parentId: string, body: string) {
    const res = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parent_id: parentId }),
    });
    if (res.ok) {
      setReplyingTo(null);
      await reload();
    }
    return res.ok;
  }

  async function submitEdit(commentId: string, body: string) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      setEditingId(null);
      await reload();
    }
    return res.ok;
  }

  async function handleDelete(commentId: string) {
    const confirmed = window.confirm("Delete this comment permanently?");
    if (!confirmed) return;
    const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) await reload();
  }

  return (
    <div className="space-y-6">
      {/* New comment composer */}
      <section>
        <h4 className="mb-2 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
          Add a comment
        </h4>
        <CommentComposer
          entryId={entryId}
          onSubmit={submitNew}
          placeholder="Leave a note for the team. Use @Name to mention someone."
        />
      </section>

      {/* Thread */}
      {comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-5 w-5" />}
          title="No comments yet"
          description="Comments are visible to everyone on the entry. @mentions notify the person you mention."
        />
      ) : (
        <ol className="space-y-4">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              editingId={editingId}
              replyingTo={replyingTo}
              entryId={entryId}
              onStartEdit={() => setEditingId(c.id)}
              onCancelEdit={() => setEditingId(null)}
              onSubmitEdit={(body) => submitEdit(c.id, body)}
              onStartReply={() => setReplyingTo(c.id)}
              onCancelReply={() => setReplyingTo(null)}
              onSubmitReply={(body) => submitReply(c.id, body)}
              onDelete={() => handleDelete(c.id)}
              onEditReply={(replyId) => setEditingId(replyId)}
              onDeleteReply={(replyId) => handleDelete(replyId)}
              onSubmitReplyEdit={submitEdit}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Single comment (with replies)
// --------------------------------------------------------------------------

function CommentItem({
  comment,
  currentUserId,
  isAdmin,
  editingId,
  replyingTo,
  entryId,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onDelete,
  onEditReply,
  onDeleteReply,
  onSubmitReplyEdit,
}: {
  comment: CommentRecord;
  currentUserId: string;
  isAdmin: boolean;
  editingId: string | null;
  replyingTo: string | null;
  entryId: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (body: string) => Promise<boolean>;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSubmitReply: (body: string) => Promise<boolean>;
  onDelete: () => void;
  onEditReply: (replyId: string) => void;
  onDeleteReply: (replyId: string) => void;
  onSubmitReplyEdit: (replyId: string, body: string) => Promise<boolean>;
}) {
  const isAuthor = comment.user_id === currentUserId;
  const isEditing = editingId === comment.id;
  const isReplying = replyingTo === comment.id;
  const canEdit = isAuthor && !isEditing;
  const canDelete = isAdmin;

  return (
    <li>
      <article className="rounded-md border border-border bg-card p-3">
        <header className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserAvatar
              displayName={comment.author_name}
              avatarUrl={comment.author_avatar}
              size="sm"
            />
            <div>
              <p className="text-sm font-medium text-text-cell">
                {comment.author_name}
              </p>
              <p className="text-[11px] text-text-zero">
                {formatDate(comment.created_at, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {comment.is_edited ? (
                  <span className="ml-1 italic">(edited)</span>
                ) : null}
              </p>
            </div>
          </div>

          {(canEdit || canDelete) && !isEditing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Comment options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem onSelect={onStartEdit}>
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>

        {isEditing ? (
          <EditMode
            initial={comment.body}
            onCancel={onCancelEdit}
            onSave={onSubmitEdit}
          />
        ) : (
          <CommentBody body={comment.body} mentions={comment.mentions} />
        )}

        {!isEditing ? (
          <div className="mt-2 flex items-center gap-2">
            {!isReplying ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onStartReply}
                className="text-text-zero"
              >
                <Reply className="h-3 w-3" />
                Reply
              </Button>
            ) : null}
            {comment.mentions.length > 0 ? (
              <Badge variant="cyan">
                {comment.mentions.length}{" "}
                {comment.mentions.length === 1 ? "mention" : "mentions"}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {isReplying ? (
          <div className="mt-3 border-t border-border pt-3">
            <CommentComposer
              entryId={entryId}
              onSubmit={onSubmitReply}
              onCancel={onCancelReply}
              placeholder={`Reply to ${comment.author_name}…`}
              autoFocus
            />
          </div>
        ) : null}
      </article>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 ? (
        <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
          {comment.replies.map((reply) => {
            const replyEditing = editingId === reply.id;
            const replyIsAuthor = reply.user_id === currentUserId;
            return (
              <li key={reply.id}>
                <article className="rounded-md border border-border bg-card p-3">
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        displayName={reply.author_name}
                        avatarUrl={reply.author_avatar}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-text-cell">
                          {reply.author_name}
                        </p>
                        <p className="text-[11px] text-text-zero">
                          {formatDate(reply.created_at, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {reply.is_edited ? (
                            <span className="ml-1 italic">(edited)</span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {((replyIsAuthor && !replyEditing) || isAdmin) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Reply options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {replyIsAuthor && !replyEditing ? (
                            <DropdownMenuItem
                              onSelect={() => onEditReply(reply.id)}
                            >
                              <Pencil className="mr-2 h-3 w-3" />
                              Edit
                            </DropdownMenuItem>
                          ) : null}
                          {isAdmin ? (
                            <DropdownMenuItem
                              onSelect={() => onDeleteReply(reply.id)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-3 w-3" />
                              Delete
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </header>

                  {replyEditing ? (
                    <EditMode
                      initial={reply.body}
                      onCancel={() => onEditReply("")}
                      onSave={(body) => onSubmitReplyEdit(reply.id, body)}
                    />
                  ) : (
                    <CommentBody body={reply.body} mentions={reply.mentions} />
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

// --------------------------------------------------------------------------
// Edit mode — inline textarea replacing the comment body.
// --------------------------------------------------------------------------

function EditMode({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (body: string) => Promise<boolean>;
}) {
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    const ok = await onSave(value.trim());
    if (!ok) setSaving(false);
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-3 w-3" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !value.trim() || value.trim() === initial}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
