# 4. Do the rates exactly, and bound the work

## Status

Accepted

## Context

A build that fails on a pass rate must fail for the same reason every time. A rate computed as a floating point number and
compared with a minimum can land on either side of it: 9 of 10 can come out a hair under 90 percent, and 899 of 1,000 can
round up to it. A tool that reads files it does not control can also be made to work for a very long time, or to run out of
memory or stack, by a file that is only large or oddly shaped.

## Decision

1. A pass rate is two whole numbers, the cases that pass and the cases evaluated, kept as BigInt. The minimum is read from its
   characters as a plain decimal from 0 to 100 (at most 40 digits) and the two are compared by cross multiplication, with no
   floating point number and no rounding. A rate is rounded to one decimal, half up, only when it is shown.
2. A case passes when it has no error-level finding from a check about cases. That is decided from the findings of the case
   before any cap on the findings that are listed, so a cap never changes a rate.
3. The work is bounded and no function calls itself. The reader of tables has limits of rows, columns, cells and cell length;
   JSON Lines has limits of records, fields, nesting and length; a list has at most 1,000 entries and a phrase at most 1,000
   characters; an answer can cite at most 10,000 distinct sources; and a run may search at most 8,000,000,000 characters in
   all, after which it stops with an error and no report.
4. The searches for emails and numbers are loops that take bounded steps, and no pattern with nested repeats runs over an
   answer, so an answer of ten million characters of one letter is read in linear time.
5. At most 1,000 findings of one check are listed. The rest are counted, noted and included in the totals.
6. Hostile tests (a hundred thousand cases, an answer of ten million characters, a million facts, a line nested a hundred
   thousand levels deep) check the time, with limits that widen under coverage.

## Consequences

- The same file and options give the same pass rates on every machine, and a rate on the line is decided exactly.
- A very large file may stop with an error and need to be checked in parts; the message says so.
- The limits are in docs/limits.md, and changing one is a change to the tool and to its tests.
