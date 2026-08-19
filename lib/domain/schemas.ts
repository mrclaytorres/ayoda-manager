// T023 — validation shared by the client forms and the Server Actions.
// The database constraints are the authority; these give fast, friendly feedback.
import { z } from 'zod';

export const memberName = z
  .string()
  .trim()
  .min(1, 'Enter a member name.')
  .max(60, 'Member names are limited to 60 characters.');

export const combatPower = z
  .number({ message: 'Combat Power must be a number.' })
  .int('Combat Power must be a whole number.')
  .min(0, 'Combat Power cannot be negative.')
  .max(2_147_483_647, 'That Combat Power is too large.');

/**
 * Combat Power is optional — a hand-arranged line may never use it — so null is a valid value and
 * not a validation failure.
 */
export const optionalCombatPower = combatPower.nullable();

/**
 * Form fields arrive as strings; reject "12abc" rather than letting Number() shrug. Blank means
 * "no Combat Power", which is different from zero: zero is a real ranking, blank is unranked.
 */
export const combatPowerFromInput = z
  .string()
  .trim()
  .transform((raw) => (raw === '' ? null : raw))
  .pipe(
    z
      .string()
      .regex(/^\d+$/, 'Combat Power must be a whole number of 0 or more, or left blank.')
      .transform(Number)
      .pipe(combatPower)
      .nullable(),
  );

export const itemName = z
  .string()
  .trim()
  .min(1, 'Enter an item name.')
  .max(120, 'Item names are limited to 120 characters.');

/**
 * The officer types a loot list, one item per line. Blank lines are dropped rather than rejected —
 * a trailing newline is how a list ends, not a mistake worth an error message.
 */
export const itemNameList = z
  .string()
  .transform((raw) =>
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  )
  .pipe(
    z.array(itemName).min(1, 'Enter at least one item.').max(50, 'Add at most 50 items at a time.'),
  );

export const uuid = z.uuid('Expected an identifier.');

export const orderingMode = z.enum(['current_cp', 'carry_previous', 'manual']);
export const awardMode = z.enum(['sequence', 'manual']);

export const lineName = z
  .string()
  .trim()
  .min(1, 'Enter a name for the line.')
  .max(60, 'Line names are limited to 60 characters.');

export const createLineInput = z.object({ name: lineName });
export const renameLineInput = z.object({ id: uuid, name: lineName });
export const removeLineInput = z.object({ id: uuid });

export const addMemberInput = z.object({
  lineId: uuid,
  name: memberName,
  combatPower: optionalCombatPower,
});
export const updateMemberInput = z.object({
  id: uuid,
  name: memberName.optional(),
  // `null` clears it; `undefined` leaves it alone. The two are not the same instruction.
  combatPower: optionalCombatPower.optional(),
});
export const removeMemberInput = z.object({ id: uuid });

export const addItemsInput = z.object({ lineId: uuid, names: z.array(itemName).min(1).max(50) });
export const removeItemInput = z.object({ id: uuid });

export const startRoundInput = z.object({ lineId: uuid, orderingMode });
export const setRoundOrderInput = z.object({
  roundId: uuid,
  memberIds: z.array(uuid).min(1, 'A round needs at least one member.'),
});
export const resetRoundInput = z.object({ roundId: uuid });

export const startDistributionInput = z.object({ itemId: uuid, clientActionId: uuid });
export const recordPassInput = z.object({
  distributionId: uuid,
  memberId: uuid,
  clientActionId: uuid,
});
export const recordAwardInput = z.object({
  distributionId: uuid,
  memberId: uuid,
  mode: awardMode,
  clientActionId: uuid,
});
export const closeUnclaimedInput = z.object({ distributionId: uuid, clientActionId: uuid });
export const undoLastActionInput = z.object({ distributionId: uuid });
export const cancelDistributionInput = z.object({ distributionId: uuid });

/**
 * The literal the officer must type to destroy history (FR-046).
 * The server re-checks this; the client check is a courtesy, not the guard.
 */
export const DELETE_CONFIRMATION = 'YES';

export const deleteRoundHistoryInput = z.object({
  roundIds: z.array(uuid).min(1, 'Select at least one round to delete.'),
  // Deliberately NOT trimmed or upper-cased. "yes" is not "YES", and pretending otherwise would
  // weaken the guard the officer thinks they are getting.
  confirmation: z.string(),
});

export const importMemberRow = z.object({ name: memberName, combatPower: optionalCombatPower });

export const importMembersInput = z.object({
  lineId: uuid,
  rows: z
    .array(importMemberRow)
    .min(1, 'There is nothing to import.')
    .max(500, 'Import at most 500 members at a time.'),
});

export const emailInput = z.email('Enter a valid email address.');
export const passwordInput = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Passwords are limited to 72 characters.');

export const credentialsInput = z.object({ email: emailInput, password: passwordInput });
