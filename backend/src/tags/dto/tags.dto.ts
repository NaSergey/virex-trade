import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Journal categories: 'setup' = entry reason, 'emotion' / 'mistake' = what the
// trader did wrong. Stats group by these so "which setups win" and "what my
// mistakes cost" read separately.
export const TAG_TYPES = ['setup', 'emotion', 'mistake'] as const;
export type TagType = (typeof TAG_TYPES)[number];

// Color is never client-supplied — the server assigns it (see TagsService.pickColor)
// so tags stay visually distinct instead of everyone picking the same few colors.
export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name: string;

  @IsOptional()
  @IsIn([...TAG_TYPES])
  type?: TagType;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsIn([...TAG_TYPES])
  type?: TagType;
}

export class MergeTagDto {
  @IsString()
  intoTagId: string;
}

export class CreateSavedComboDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}

// Same shape as CreateSavedComboDto — kept as its own class since "pin this
// combo" and "hide this combo" are different actions, even if the payload
// (which exact tag set) happens to look identical.
export class DismissComboDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}

// Both fields optional and independent: {pinned} alone toggles pin state
// without touching the tag set, {tagIds} alone edits the tag set without
// touching pin state.
export class UpdateSavedComboDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class SetPositionTagsDto {
  @IsString()
  @MaxLength(30)
  symbol: string;

  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}

export class SetTradeTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds: string[];
}
