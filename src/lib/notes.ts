import { getCollection, type CollectionEntry } from 'astro:content';
import type { Lang } from '../i18n';

export type Note = CollectionEntry<'notes'>;

export const slugOf = (note: Note) => note.id.slice(note.id.indexOf('/') + 1);

const lastChanged = (note: Note) => (note.data.updated ?? note.data.date).valueOf();

export async function getNotes(lang: Lang) {
  const notes = await getCollection('notes', ({ id, data }) => id.startsWith(`${lang}/`) && !data.draft);
  return notes.sort((a, b) => lastChanged(b) - lastChanged(a));
}
