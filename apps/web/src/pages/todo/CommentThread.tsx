import { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/common/Button.js';
import { useTaskComments, useAddTaskComment, type TaskComment } from '../../api/todo.js';

interface CommentThreadProps {
  taskId: string;
  employeeId: string;
  isClosed: boolean;
}

export function CommentThread({ taskId, employeeId, isClosed }: CommentThreadProps) {
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment.mutate(
      { taskId, content: text.trim() },
      { onSuccess: () => setText('') },
    );
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading comments...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No comments yet</p>
      ) : (
        <div className="space-y-3 pr-1">
          {comments.map((c) => (
            <CommentBubble key={c.id} comment={c} isOwn={c.employeeId === employeeId} />
          ))}
          <div ref={endRef} />
        </div>
      )}

      {!isClosed && (
        <form onSubmit={handleSubmit} className="sticky bottom-0 flex gap-2 border-t border-gray-100 bg-white pt-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button
            type="submit"
            size="sm"
            loading={addComment.isPending}
            disabled={!text.trim()}
          >
            Send
          </Button>
        </form>
      )}
    </div>
  );
}

function CommentBubble({ comment, isOwn }: { comment: TaskComment; isOwn: boolean }) {
  const time = new Date(comment.createdAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      <span className="mb-0.5 text-[11px] font-medium text-gray-400">
        {comment.employeeName ?? 'Unknown'}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
          isOwn
            ? 'rounded-br-md bg-blue-600 text-white'
            : 'rounded-bl-md bg-gray-100 text-gray-800'
        }`}
      >
        {comment.content}
      </div>
      <span className="mt-0.5 text-[10px] text-gray-400">{time}</span>
    </div>
  );
}
