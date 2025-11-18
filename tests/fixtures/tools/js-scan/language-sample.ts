type LanguageUser = {
  id: number;
  label: string;
};

export function lookupLanguageUser(id: number): LanguageUser {
  return {
    id,
    label: `User ${id}`
  };
}
