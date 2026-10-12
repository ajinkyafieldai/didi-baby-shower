# Didi baby-shower pilot — post-event retrospective

**Event:** 11 October 2026, evening IST  
**Product:** APSILA, standalone Didi event experience  
**Document type:** Event / product retrospective, **not** an RFC-0008 incident postmortem  
**Status:** Initial retrospective; evidence and action owners to be reconciled

## Scope and evidence standard

This retrospective assesses the event experience, technical outcomes, operator workload and product hypotheses. It is not a declaration that the pilot as a whole was an incident. Specific operational failures discovered during the event may be assessed separately against RFC-0008.

Statements below distinguish participant/operator observations from verified telemetry and untested hypotheses. The pre-event test and acceptance plan is in [pilot-2026-10-11.md](pilot-2026-10-11.md). Do not use preliminary test entries there as proof of live-event acceptance.

## Event and overall outcome

The family held a fully online baby-shower celebration spanning locations reported as Mumbai, Chicago, Toronto, Goa, Singapore and Frankfurt. The event used Daily for media transport and APSILA interactions for rituals, group celebrations, games, family sharing and a host/projector experience.

**Reported live outcome:** the event completed successfully, with a reported peak of approximately **13 simultaneous connections**, lasting about **2–2.5 hours**. The operator reported no material video-transport interruption during the event and limited intervention; these are human observations, not a verified network-availability SLA. Daily cloud recording produced roughly **4 GB** of recordings. A participant initially missing from a captured family photo was later confirmed present in the video recording.

Seven named Moments were captured and later reflected in the keepsake timeline:

1. Mangal aaji's song
2. Oti ceremony beginning
3. Anju maushi's poem
4. Atharva's poem
5. Manjusha singing lyrics written by Mangesh
6. Munnu's poem
7. Didi's tummy / family-photo moment

The seven-item list follows the operator's event notes; confirm ordering and exact display titles against the final keepsake before treating it as a canonical timeline. The recording was also linked via unlisted YouTube video in the post-event page; an unlisted link is not itself an access-control guarantee.

## What worked

### Shared participation, not passive viewing

Participants brought prepared poems and songs, engaged in rituals, and used reactions enthusiastically. The operator observed a burst of early exploratory reactions followed by more contextual use. Group celebration effects, interactive haldi/kunku/oti/aarti/blessing gestures, and personalized family games created active participation. The personalized games were especially well received; they should not be described as icebreakers, because this family was already accustomed to online gatherings.

When the prepared questions UI failed, a cousin improvised a collaborative version. This preserved the social moment despite a feature failure, but it does not establish that the product's game interaction worked.

### Event recording and memories

The Moments system enabled the operator to mark meaningful parts of the ceremony and refer back to them afterward. The event yielded a substantial cloud recording and a keepsake experience with family photo, performances, and a recording timeline. Participant material shared after the ceremony could still be represented in keepsake output.

### Small-operator model

The pilot reportedly needed little real-time operational intervention relative to the scope of the event, and did not require the product team to script every family interaction or produce personalized content in advance. This is encouraging evidence for a DIY event model, **not** proof of unsupervised repeatability or per-event profitability.

### Reported device / media behaviors

Pre-event testing reported successful Android and desktop join paths, permission recovery on Android, pin/grid/fullscreen/rotation behavior, and iPhone Bluetooth audio. The apparent Android Bluetooth failure was subsequently explained by the operator wearing one functional pair of earbuds while the phone was connected to another. These outcomes belong to the device acceptance notes, not automatically to live usage.

## What did not work or was underused

| Observation | Evidence / qualification | Product implication |
| --- | --- | --- |
| Questions UI did not function as intended | Operator report; cousin switched to collaborative verbal game | A game needs reliable fallback and clear host controls |
| Two elderly guests struggled with mute/navigation recovery | Operator observation | Assisted participation and clearer recovery are important |
| Notes, recipes and people-map pins did not synchronize between participants | Pre-event testing: browser-local state; operator reported unsynced content | Shared state must be durable and visible across guests before promising collaborative use |
| Android Bluetooth appeared to fail | Operator subsequently confirmed the phone was connected to a working pair of earbuds other than the pair being worn | Operator oversight; check the selected Bluetooth device before attributing a failure to Android or the application |
| Reactions initially fired excessively | Observed exploration and timing behavior | Tunable pacing; don't suppress authentic celebration |
| Message wall saw little use | Participants were mostly on open microphones | Optional asynchronous features need stronger event-context rationale |
| Maps, uploads and recipes saw little use | Operator observations; mobile discoverability was limited | Test placement, timing and pre-event prompts before judging demand |
| People-pin / shared-family state could be browser-local | Test findings; backend snapshot omitted family data | Explicit ownership of realtime/persistent event state |
| Family photo omitted a participant | Captured photo observation; recording included the participant | Photo capture should communicate participation/capture completeness, not silently imply everyone was captured |

Underuse does not prove a feature is unwanted: invitations, timing, discoverability, and suitability to this event were not controlled.

## Bluetooth finding — revised classification

**Classification:** Operator oversight, not a confirmed software defect or architectural drift. The Android device was connected to a different, functional pair of Bluetooth earbuds than the pair being worn. No evidence establishes a WebRTC or Daily routing defect from this observation.

**Operator's preferred explanation (humorous):** His elevated intellect was temporarily operating above the level of mere mortals and overlooked the mundane task of checking which earbuds were connected.

**Practical preventive action:** Confirm the selected Bluetooth device and perform a brief audio check before escalating an apparent routing failure.

## Lessons and hypotheses

**Product framing.** Start with fully online family celebrations, including participants who cast to a household TV. Live rituals, performances and moments are more distinctive than reproducing a generic conferencing UI.

**Before the event.** Guests had prepared poems without uploading them beforehand. Consider pre-event prompts and private contribution submission so materials can be staged without making content creation mandatory.

**During the event.** A lightweight event lifecycle / lineup would help guide hosts and guests through successive rituals and contributions. Private subrooms could support conversations and assisted troubleshooting without interrupting the main ceremony.

**Accessibility.** An RSVP-based assisted mode for older or less technically confident guests is worth prototyping. The goal is easy recovery and host assistance, not removing participant autonomy.

**At departure.** A brief optional exit interview could capture fresh observations; do not conflate this feedback or usage analytics with RFC-0008 operational logs.

**After the event.** Keepsakes and delayed sharing matter. People may contribute material after the live ceremony, and the output should remain discoverable and appropriately access-controlled.

**Business hypothesis.** A DIY tier around ₹5,000 was discussed separately. This pilot does not validate pricing, market demand, payment flow, support cost, profitability or a 10-events/day target. Billing and checkout architecture are independent workstreams.

## Follow-up candidates (not committed delivery promises)

| Priority for exploration | Proposed work | Suggested owning area |
| --- | --- | --- |
| High | Fix and test live questions/game flow with host fallback | APSILA event UI / runtime |
| High | Replace browser-local notes, recipes and pins with durable shared state, stable IDs and conflict-safe updates | Dugong realtime / event experience |
| High | Improve assisted join, mute/navigation recovery and mobile discoverability | APSILA frontend / host controls |
| Low | Add a preflight reminder to verify which paired Bluetooth earbuds are actually connected | Event operator checklist |
| Medium | Add pre-event prompts, staging for performances, and permission-aware contribution uploads | Event setup / storefront / runtime |
| Medium | Prototype lineup, private rooms, host assistance and optional exit feedback | Dugong / event UX |
| Medium | Verify family-photo capture completeness indicators and keepsake permissions | Photo/keepsake flow |
| Medium | Reconcile event recording, duration, provider participant-minutes and cost against provider records | Event operations |

These are candidates for independently owned implementation issues. They are not automatically RFC-0008 incident reports or permanent corrective actions.

## RFC-0008 boundary

The retrospective is **outside the normative scope of RFC-0008**. Its evidence discipline is useful guidance: preserve observations, distinguish inferred explanations, state uncertainty and track decisions. A demonstrated deployed-system failure, such as the live questions UI failure, may separately warrant incident reporting under RFC-0008, with its own authoritative pattern record and investigation. This document does not make the incident classification decision or substitute for that record.

## Outstanding evidence to reconcile

- Final deployed Pages and Worker revisions, room/session details and host telemetry exports.
- Actual event connection count, start/end time and participant-minutes from provider data.
- Full live device/browser outcomes versus pre-event device tests.
- Recording completeness, consent/access arrangements, and retention expectations.
- Final names, order and artifact links for seven Moments.
- Whether a permanent fix for live questions was already shipped and verified.
- A list of implemented follow-ups versus hypotheses still awaiting prioritization.

No missing measurement should be backfilled from recollection as if it were telemetry.
