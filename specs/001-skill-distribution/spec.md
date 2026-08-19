# Feature Specification: Guild Skill Loot Distribution

**Feature Branch**: `001-skill-distribution`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "I want to create an application for the RF Online Next skill distribution. So we have skill loots that we want to distribute based on guild member's combat power. We distribute the skills via a round-robin system where the 1st-in-line is the highest CP. A member may pass to a skill if he wants to. So the next-in-line may have the change to get it, and so on. After a member gets a skill, they will be remove from the list, until all of the members gets a chance to receive a skill. Once all of the members get the skill, the round will reset to the original sequence. So I want to create an app to manage this, the inputs would be the name of the members, their Combat Power, and the Skill Name. This would be a web application that is mobile-friendly, with a login mechanism/ account which will save the data."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distribute an item down the combat-power line (Priority: P1)

A guild officer has a roster of members, each with a recorded Combat Power (CP). When a skill loot drops, the officer opens the app, enters the skill name, and the app shows who is first in line — the highest-CP member who has not yet received a skill this round. The officer asks that member; if they take it, the officer marks it awarded and that member drops out of the line for the rest of the round. If they decline, the officer marks a pass and the offer moves to the next member down the CP order. If the situation calls for it, the officer can also award the skill directly to any eligible member without walking the line.

**Why this priority**: This is the entire reason the app exists. Delivered alone — even with a roster typed in fresh each session — it replaces the error-prone spreadsheet or chat-log process the guild uses today.

**Independent Test**: Enter three members with distinct CP values, start a distribution for a named skill, pass on the top two, award to the third, and confirm the awarded member no longer appears as eligible while the two who passed remain at the top of the line for the next skill.

**Acceptance Scenarios**:

1. **Given** a roster of members with distinct CP values and no distributions yet this round, **When** the officer starts a distribution for a skill, **Then** the highest-CP member is shown as the current offer holder.
2. **Given** a member is the current offer holder, **When** the officer records an award to that member, **Then** the skill is logged to that member and they are removed from the eligible line for the remainder of the round.
3. **Given** a member is the current offer holder, **When** the officer records a pass, **Then** the offer moves to the next-highest-CP eligible member and the passing member remains eligible for later items in the same round.
4. **Given** a distribution is in progress, **When** the officer chooses to award the skill manually to a named eligible member further down the line, **Then** that member receives the skill, is removed from the eligible line, and the award is marked in the history as a manual award.
5. **Given** every eligible member has passed on the current skill, **When** the officer is asked how to close the distribution, **Then** they can either record the skill as unclaimed — removing nobody from the line — or manually award it to any eligible member, which removes that member from the line.
6. **Given** a distribution is in progress, **When** the officer records a mistaken pass, award, or manual award, **Then** they can undo the most recent action and return the distribution to its prior state.

---

### User Story 2 - Complete a round and reset the sequence (Priority: P2)

Over the course of a raid night, members are awarded skills one by one and drop out of the line. When the last remaining member is awarded a skill, the round is complete. The app then starts a fresh round with every member eligible again — and asks the officer whether the new round should be ranked using the members' current Combat Power values or should reuse the sequence from the round just finished.

**Why this priority**: Without a reset the app becomes unusable after one full cycle. It is second only to the distribution itself, but the distribution is demonstrably valuable before the first round ever completes.

**Independent Test**: With a roster of three members, award a skill to each in turn, confirm the app reports the round complete, then confirm the officer is offered both ordering choices and that the selected one determines the new round's sequence.

**Acceptance Scenarios**:

1. **Given** exactly one member remains eligible in the round, **When** that member is awarded a skill, **Then** the app reports the round complete.
2. **Given** a round has just completed and a member's CP was edited during it, **When** the officer starts the next round and chooses to apply current Combat Power, **Then** the new round's sequence is ranked using the edited values.
3. **Given** a round has just completed, **When** the officer instead chooses to reuse the previous sequence, **Then** the new round's order matches the completed round's order exactly and any CP edits remain pending for a future round.
4. **Given** a round is in progress, **When** the officer views the app, **Then** the current round number, the ordering choice that produced it, and how many members have received a skill out of the total are visible.
5. **Given** a round is in progress, **When** the officer chooses to reset the round manually, **Then** they are warned that in-round progress will be cleared and the reset only proceeds on confirmation.

---

### User Story 3 - Keep guild data on an account across sessions and devices (Priority: P3)

The officer creates an account, signs in, and their roster, round state, and distribution history are saved. They can close the browser, sign in later on their phone during a raid, and pick up exactly where the guild left off. No other account can see their guild's data.

**Why this priority**: Persistence turns a useful session tool into the guild's system of record. The distribution logic is demonstrable without it, so it follows the core loop.

**Independent Test**: Create an account, enter a roster and record one award, sign out, sign in on a second device, and confirm the roster, round position, and award are all present and identical.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they register with an email address and password, **Then** an account is created and they are signed in.
2. **Given** a signed-in officer with saved guild data, **When** they sign out and sign back in from a different device, **Then** their roster, current round state, and history are restored unchanged.
3. **Given** two separate accounts each with their own guild data, **When** either account signs in, **Then** they see only their own guild's members, rounds, and history.
4. **Given** an officer has forgotten their password, **When** they request a reset for their registered email address, **Then** they receive a means to set a new password.
5. **Given** an officer's session has expired, **When** they attempt to record a distribution action, **Then** they are prompted to sign in again and no data is lost or silently discarded.

---

### User Story 4 - Maintain the roster as the guild changes (Priority: P4)

Members join, leave, and grow their Combat Power. The officer needs to add a new recruit, remove someone who left, and update CP values after gear upgrades — at any time, including mid-round, without disturbing the sequence the current round is running on.

**Why this priority**: A guild roster is never static, but the app is usable for at least one raid night with a roster entered once. This makes it sustainable rather than possible.

**Independent Test**: Mid-round, add a new member, remove an existing member who has not yet received a skill, and edit another member's CP; confirm the current round's order is unchanged, the CP edit is flagged as pending, and the app states how each change affected the line.

**Acceptance Scenarios**:

1. **Given** a signed-in officer, **When** they add a member with a name and a Combat Power value, **Then** the member appears in the roster ranked by CP.
2. **Given** a member is added while a round is in progress, **When** the roster updates, **Then** the new member is eligible for the remainder of the current round and is placed according to their CP.
3. **Given** a member is removed while a round is in progress, **When** the roster updates, **Then** they no longer appear in the line and their prior awards remain in the history.
4. **Given** a round is in progress, **When** the officer edits a member's Combat Power, **Then** the edit is saved, the current round's order is unchanged, and the member is flagged as having a Combat Power change pending for the next round.
5. **Given** one or more members have pending Combat Power changes, **When** the officer views the roster, **Then** both the value the current round was ranked on and the new value are visible.
6. **Given** an officer enters a member name that already exists in the roster, **When** they attempt to save, **Then** they are told the name is already used and the duplicate is not created.

---

### User Story 5 - Review what was awarded to whom (Priority: P5)

After a raid, the officer wants to confirm the distribution was fair and settle any disagreement: which skills went to which members, in which round, who passed on what, and which awards were made manually rather than by walking the line. Long-dead rounds can be cleared away, but only deliberately.

**Why this priority**: Trust and dispute resolution. Valuable, but the guild can operate on the live view alone for a while.

**Independent Test**: Record several distributions across two rounds, including one manual award and one unclaimed skill, then open the history and confirm each entry shows the skill, the outcome, who passed, the round, and when it happened.

**Acceptance Scenarios**:

1. **Given** several completed distributions, **When** the officer opens the history, **Then** each entry shows the skill name, the recipient, the members who passed, whether the award was manual, the round number, and the date and time.
2. **Given** a history spanning multiple rounds, **When** the officer filters by a member or by a round, **Then** only the matching entries are shown.
3. **Given** a skill that nobody accepted and that was not manually awarded, **When** the officer opens the history, **Then** the entry appears marked as unclaimed with the list of members who passed.
4. **Given** the officer chooses to delete the history of one or more completed rounds, **When** the confirmation appears, **Then** it states how many rounds and distributions will be destroyed and refuses to proceed until the officer types the exact word `YES`.
5. **Given** the officer attempts to delete the history of the round currently in progress, **When** they make the request, **Then** it is refused and they are pointed at round reset instead.

---

### Edge Cases

- **Two members share the same Combat Power**: the app must place them in a stable, predictable order that does not change between page loads within a round, and must make the tie visible so the officer can resolve it by guild convention if they wish.
- **Every eligible member passes on a skill**: the officer is asked whether to record it unclaimed or award it manually. Recording it unclaimed removes nobody and leaves the round position unchanged.
- **One member remains eligible and passes**: the officer can close it as unclaimed — the round does not complete and that member is still the sole eligible member for the next skill — or award it to them manually, which completes the round.
- **A manual award is aimed at a member who already received a skill this round**: rejected, because it would give one member two skills in a round.
- **Roster of exactly one member**: every skill goes to that member and the round completes and resets after each award.
- **Distribution started with an empty roster**: the officer is told a roster is required and no round or distribution is created.
- **The next-in-line member is removed from the roster mid-offer**: the offer moves to the next eligible member and the officer is told why.
- **The last remaining eligible member is removed from the roster**: the round completes immediately rather than stalling with an empty line.
- **A member is added after the round is already complete but before the next round starts**: they participate from the first skill of the new round, ranked by their CP under whichever ordering choice the officer makes.
- **A member's CP is edited and then edited back before the next round starts**: no pending change is shown, since the value matches the one the round was ranked on.
- **A member with a pending CP change is removed before the next round**: the pending change disappears with them and does not affect the next round's ranking.
- **Combat Power entered as zero, negative, or non-numeric**: rejected with a clear message; zero is accepted, negative and non-numeric are not.
- **Two devices signed into the same account record actions at the same time**: the guild data must not end up with a member awarded twice in one round or a skill logged twice.
- **Connection is lost part-way through recording a distribution**: the officer is told the action did not save and can retry without producing a duplicate entry.
- **A member's name contains unusual characters or is very long**: stored and displayed without breaking the layout on a phone.
- **History deletion is confirmed with anything other than `YES`** (lower case, whitespace, a near-miss): refused, and nothing is destroyed.
- **History deletion is requested for a round that no longer exists** (already deleted from another device): reported as already gone rather than failing obscurely.
- **All completed rounds are deleted while a round is in progress**: the active round and the roster are untouched, and the round numbering continues from where it was rather than restarting.

## Requirements *(mandatory)*

### Functional Requirements

#### Accounts and data ownership

- **FR-001**: System MUST allow a visitor to create an account using an email address and a password.
- **FR-002**: System MUST allow an account holder to sign in and sign out.
- **FR-003**: System MUST allow an account holder to recover access by requesting a password reset for their registered email address.
- **FR-004**: System MUST persist all guild data — roster, round state, and distribution history — against the owning account and restore it on any subsequent sign-in from any device.
- **FR-005**: System MUST prevent any account from viewing or modifying guild data belonging to another account.
- **FR-006**: System MUST require sign-in before any guild data can be viewed or modified.
- **FR-007**: System MUST treat the account holder as the sole operator: guild members are roster records, not application users. There are no member logins, invitations, or permission roles.

#### Lines

- **FR-057**: Users MUST be able to create several lines and run a round on each of them at the same time. A line is one rotation: its own members, its own item pool, and its own round numbering.
- **FR-058**: System MUST keep each line's members separate. The same person taking part in two lines is two independent records, each with its own Combat Power, edited separately.
- **FR-059**: System MUST scope an award to the line it happened on, so receiving an item on one line leaves that person eligible on every other.
- **FR-060**: Users MUST be able to rename a line, and to delete one — taking its members, items, rounds, and history with it — behind a confirmation that requires typing the line's name.
- **FR-061**: System MUST number rounds within a line, so each line has its own Round 1, and MUST name the line wherever a round number is shown outside that line.

#### Roster management

- **FR-008**: Users MUST be able to add a guild member by entering a name and a Combat Power value.
- **FR-009**: System MUST reject a member name that duplicates an existing member's name in the same guild, and explain why.
- **FR-010**: System MUST reject a Combat Power value that is negative or not a number, and explain why. Zero MUST be accepted, and so MUST a blank — a line ordered by hand may never use Combat Power. Blank and zero are different values: zero is a ranking, blank is unranked.
- **FR-011**: Users MUST be able to edit a member's name.
- **FR-012**: Users MUST be able to edit a member's Combat Power at any time, including while a round is in progress.
- **FR-013**: Users MUST be able to remove a member from the roster.
- **FR-014**: System MUST retain the historical record of a removed member's past awards and passes.
- **FR-015**: System MUST display the roster with each member's name, Combat Power, and which item they have already received in the current round, if any.

#### Pick order

- **FR-016**: System MUST derive a pick order by ranking members from highest to lowest Combat Power.
- **FR-017**: System MUST resolve equal Combat Power values with a stable, repeatable tie-break so the displayed order does not vary between views within a round, and MUST indicate that a tie exists.
- **FR-018**: System MUST fix the round's pick order at the moment the round starts, so that no edit to a member's Combat Power ever reorders a round in progress. Only an explicit rearrangement (FR-063) changes a live round's order.
- **FR-019**: System MUST flag any member whose Combat Power has been edited since the current round started as having a pending change, and MUST show both the value the round was ranked on and the new value.
- **FR-020**: System MUST, when a new round starts, let the officer choose between ranking the new round by members' current Combat Power values, reusing the sequence from the previous round, and arranging the line by hand.
- **FR-062**: System MUST rank members without a Combat Power below every member who has one, zero included.
- **FR-063**: Users MUST be able to rearrange a round's order by hand at any point while it is active, including after items have been distributed, and System MUST move the current offer to whoever the new order puts first.
- **FR-064**: System MUST keep recording which ordering choice started a round (FR-022) after it has been rearranged, and MUST show that it was rearranged rather than restating the choice.
- **FR-021**: System MUST clear pending-change flags for members whose new Combat Power has been applied to a round's ranking, and retain them for members whose has not.
- **FR-022**: System MUST record, for each round, which ordering choice produced its sequence.
- **FR-023**: System MUST place a member added mid-round into the current round's line according to their Combat Power, as an eligible member. Where there is no Combat Power to place them by — the round was arranged by hand, or the newcomer has none — they MUST go to the back rather than to a guessed position.
- **FR-024**: System MUST always show who is currently first in line and the full remaining order behind them.

#### Item distribution

- **FR-025**: Users MUST be able to add item names to a pool of items awaiting distribution, entering several at once, and each name MUST NOT be empty.
- **FR-026**: System MUST present the offer to the highest-ranked member who is eligible in the current round.
- **FR-027**: Users MUST be able to record that the current offer holder accepted the item.
- **FR-028**: System MUST, on acceptance, log the award to that member and remove them from the eligible line for the remainder of the round.
- **FR-029**: Users MUST be able to record that the current offer holder passed.
- **FR-030**: System MUST, on a pass, move the offer to the next-ranked eligible member while keeping the passing member eligible for later items in the same round.
- **FR-031**: Users MUST be able to award the current item manually to any eligible member, bypassing the offer sequence, at any point in a distribution — including after every eligible member has passed.
- **FR-032**: System MUST, on a manual award, remove the recipient from the eligible line exactly as a normal award does, and MUST mark the award as manual in the history.
- **FR-033**: System MUST reject a manual award aimed at a member who has already received an item in the current round.
- **FR-034**: Users MUST be able to close a distribution as unclaimed, in which case no member is removed from the line and the round position is unchanged.
- **FR-035**: Users MUST be able to undo the most recent pass, award, or manual award and return the distribution to its previous state.
- **FR-036**: System MUST prevent a member who has already received an item in the current round from being offered another item in that round.
- **FR-050**: System MUST keep the item pool on the account, so a loot list entered after a raid survives closing the app and reappears on another device.
- **FR-051**: Users MUST be able to start a distribution by choosing any item from the pool, in any order — the pool is a list to pick from, not a queue.
- **FR-052**: System MUST take an item out of the pool as soon as it is being distributed, and MUST refuse to distribute the same item twice.
- **FR-053**: Users MUST be able to delete an item from the pool without distributing it.
- **FR-054**: System MUST return a round's items to the pool when that round is reset (FR-040), and MUST delete them along with that round's history (FR-044).
- **FR-056**: System MUST name the item a member received in the current round wherever their round state is shown — the line and the roster — not merely that they received one.
- **FR-055**: Users MUST be able to back out of a distribution started on the wrong item, returning that item to the pool and leaving no history entry. Where responses have already been recorded, System MUST say how many will be discarded and ask for confirmation first.

#### Round lifecycle

- **FR-037**: System MUST treat a round as complete when no eligible members remain, whether the last eligible member received an item or was removed from the roster.
- **FR-038**: System MUST, on completion, present a new round for the officer to start, restoring every current roster member to eligible status once started, sequenced according to the ordering choice made under FR-020.
- **FR-039**: System MUST display the current round number, the ordering choice that produced it, and the count of members who have received an item out of the total roster size.
- **FR-040**: Users MUST be able to reset the current round manually, and System MUST require an explicit confirmation that warns in-round progress will be cleared.

#### History

- **FR-041**: System MUST record, for every completed distribution, the item name, the outcome (awarded to a named member, or unclaimed), whether the award was manual, every member who passed, the round number, and the date and time.
- **FR-042**: Users MUST be able to view the distribution history and filter it by member and by round.
- **FR-043**: System MUST retain distribution history indefinitely unless the account holder deletes it under FR-044.
- **FR-044**: Users MUST be able to permanently delete the recorded history of one or more completed rounds, including the distributions and responses belonging to them.
- **FR-045**: System MUST refuse to delete the history of the active round, and MUST direct the officer to round reset (FR-040) instead.
- **FR-046**: System MUST require the officer to type the exact word `YES` before any history deletion proceeds, MUST state how many rounds and distributions will be destroyed before asking, and MUST enforce this confirmation on the server rather than in the interface alone.

#### Access and resilience

- **FR-047**: System MUST be fully usable on a phone-sized screen, with all primary actions reachable without horizontal scrolling or zooming.
- **FR-048**: System MUST tell the user clearly when an action failed to save, and allow a retry that does not create a duplicate record.
- **FR-049**: System MUST ensure that concurrent actions from two sessions on the same account cannot award two items to the same member within one round or log the same distribution twice.

### Key Entities

- **Guild Account**: The owner of a guild's data and the sole operator of the app. Holds sign-in credentials and is the boundary for all data visibility.
- **Member**: A person taking part in one line. Has a name unique within that line and an optional Combat Power. Belongs to exactly one Line. Not an application user.
- **Line**: One rotation. Owns its members, its item pool, and its rounds, and runs independently of every other line on the account.
- **Round**: One full cycle in which every member is entitled to receive one item. Has a number, a start time, the ordering choice that produced it, a fixed ordered list of participating members with the Combat Power each was ranked on, and a completion state.
- **Distribution**: A single item being offered down the line. Has an item name, the round it belongs to, an outcome (awarded to a member — normally or manually — or unclaimed), and a timestamp.
- **Item**: One piece of loot waiting to be handed out. Has a name and belongs to a Guild Account. Leaves the pool when a Distribution claims it; two items with the same name are distinct.
- **Offer Response**: One member's response within a Distribution — a pass or an acceptance — recorded in the order the responses occurred.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new officer can register, enter a 20-member roster, and record their first item award in under 5 minutes without external instructions.
- **SC-002**: Recording a single distribution — picking the item, recording up to three passes, and awarding it — takes under 30 seconds on a phone.
- **SC-003**: Anyone opening the app on a phone can identify who is first in line without scrolling.
- **SC-004**: Across any completed round, every roster member present at round start receives exactly one item, and no member receives a second before the round completes — verifiable in the history for 100% of rounds.
- **SC-005**: 100% of recorded roster changes, awards, and passes are still present and identical after signing out and signing in on a different device.
- **SC-006**: No account can retrieve another account's guild data through any path in the app — zero cross-account disclosures.
- **SC-007**: 90% of first-time officers complete a full distribution, including at least one pass, on their first attempt without assistance.
- **SC-008**: All primary screens are usable at a 360-pixel screen width with no horizontal scrolling and no clipped controls.
- **SC-009**: Disputes about who was next in line drop to zero, because the app's displayed order and history are the guild's single source of truth.

## Assumptions

- **One officer operates the app.** A single account owns the guild's data and records every pass and award on behalf of members. Members are asked in person or in voice chat; the app is the ledger and the order of record. No member logins, invitations, or roles.
- **A line is a rotation, not a guild.** Items that are distributed separately deserve separate rotations, so an account runs as many lines as it needs, side by side. Each keeps its own members deliberately: the same person can sit at a different place in the weapons line and the armour line, and linking the two would force one Combat Power to mean the same thing in both.
- **Combat Power is a manually entered whole number, and optional.** There is no integration with the game client or any external data source; the officer types CP values in and updates them as members re-gear. Some lines are ordered by agreement rather than by numbers, so the column can be left empty entirely.
- **Passing is free.** A member who passes keeps their rank and remains eligible for every later item in the same round. Only receiving a skill removes a member from the line.
- **The round order is a snapshot, and re-ranking is a deliberate choice.** The pick order is captured when a round begins and never re-sorts mid-round. Combat Power can still be edited at any time; those edits are held as pending and the officer decides at the start of each new round whether to rank by current values or carry the previous sequence forward.
- **Backing out is not the same as unclaimed.** Closing a distribution as unclaimed means the item was offered and nobody took it, and it belongs in the history. Backing out means the distribution should never have started, so it leaves no trace.
- **Manual award is an override, not the norm.** The offer sequence is the default path; the manual award exists so the officer can settle an all-pass item or an off-line agreement without leaving the app, and it is marked as manual so the history stays honest.
- **Item names are free text.** There is no catalogue of valid RF Online item names to validate against, and two pool entries with the same name stay separate rows — two of the same item can drop in one night.
- **Guild sizes are modest.** Rosters are expected in the tens, not thousands, and history in the low thousands of entries per account.
- **Standard email-and-password sign-in is sufficient.** No single sign-on, two-factor authentication, or game-account linking in this scope.
- **Online use.** The app requires a network connection; offline recording and later synchronisation are out of scope.
