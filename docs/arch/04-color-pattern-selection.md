# Color Pattern Selection Flow

## Color Pattern Selection

```mermaid
flowchart TD
    A[User select color pattern] --> B{is the valid color pattern?}
    B -- No --> A
    B -- Yes --> C[Change color pattern]
    C --> A
```