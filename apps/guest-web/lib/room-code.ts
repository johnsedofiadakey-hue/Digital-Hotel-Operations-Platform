export interface ParsedRoomCode {
  branchCode: string;
  roomLabel: string;
}

// "ACCRA-204" -> { branchCode: "ACCRA", roomLabel: "204" } (§4.5). Branch
// codes never contain hyphens (enforced at the DB — branches_code_format),
// so splitting on the first hyphen is unambiguous even if a room label has
// one.
export function parseRoomCode(raw: string): ParsedRoomCode | null {
  const trimmed = raw.trim();
  const separatorIndex = trimmed.indexOf("-");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) return null;

  return {
    branchCode: trimmed.slice(0, separatorIndex).toUpperCase(),
    roomLabel: trimmed.slice(separatorIndex + 1),
  };
}
