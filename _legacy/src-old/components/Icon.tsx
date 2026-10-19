export default function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, JSX.Element> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    edit: <><path d="M12 4H5v16h15v-7" /><path d="m10 14 2-5 7-7 3 3-7 7Z" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 3" /></>,
    file: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m8 8 4 3 4-3M8 15h8m-8 3h6" /></>,
    award: <><path d="m12 3 8 3v14H4V6Z" /><circle cx="12" cy="11" r="3" /><path d="m10 14-1 4 3-1 3 1-1-4" /></>,
    layers: <><path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5" /></>,
    settings: <><path d="m9 3-1 3-3 1-2 3 2 3-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-3 1-3-3-2-3 1-2-3Z" /><circle cx="12" cy="12" r="3" /></>,
    folder: <path d="M3 5h7l2 3h9v12H3Z" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
