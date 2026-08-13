import { useState } from 'react';
import type { StickyNote } from '../../shared/types';
import { formatNoteDate } from '../../shared/noteUtils';
import { getDarkColor } from '../../shared/noteColors';

const MAX_VISIBLE_TAGS = 7;

interface NoteCardProps {
  note: StickyNote;
  tagColors: Record<string, string>;
  onOpen: () => void;
  onDelete: () => void;
}

export function NoteCard({ note, tagColors, onOpen, onDelete }: NoteCardProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const visibleTags = tagsExpanded ? note.tags : note.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = note.tags.length - MAX_VISIBLE_TAGS;

  return (
    <li className="list-app__note" style={{ backgroundColor: note.color }}>
      <div className="list-app__note-header">
        <span className="list-app__note-date">{formatNoteDate(note.createdAt)}</span>
        <button className="list-app__note-delete" onClick={onDelete} aria-label="메모 삭제">
          ×
        </button>
      </div>
      <button className="list-app__note-open" onClick={onOpen}>
        <span className="list-app__note-content">{note.content || '(빈 메모)'}</span>
        <span className="list-app__note-tags">
          {visibleTags.map((tag) => {
            const color = tagColors[tag.toLowerCase()] ?? note.color;
            return (
              <span
                key={tag}
                className="list-app__note-tag"
                style={{ backgroundColor: color, color: getDarkColor(color) }}
              >
                #{tag}
              </span>
            );
          })}
          {!tagsExpanded && hiddenCount > 0 && (
            <span
              className="list-app__note-tag-more"
              onClick={(event) => {
                event.stopPropagation();
                setTagsExpanded(true);
              }}
            >
              ...
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
