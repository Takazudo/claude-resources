# Mermaid Syntax Guide

## Common Syntax Rules (ALL Diagram Types)

### Critical Rules to Avoid Errors

1. **NO HTML tags in text** - Never use `<br/>`, `<br>`, or any HTML
   - ❌ `participant User<br/>Browser`
   - ✅ `participant UserBrowser as User Browser`

2. **Line breaks in labels** - Use escaped newlines or avoid them
   - ❌ Multi-line text with `<br/>`
   - ✅ Use short, single-line labels

3. **Special characters** - Escape or avoid: `#`, `{`, `}`, `[`, `]`, `(`, `)`
   - ❌ `A[Label with (parentheses)]`
   - ✅ `A[Label with parentheses]`

4. **NO style/color directives** (per CLAUDE.md)
   - ❌ `style A fill:#ff0000`
   - ❌ `classDef myClass fill:#f9f,stroke:#333`
   - ✅ Use default styling only

5. **Quotes** - Use for labels with special characters
   - `A["Label with: special chars"]`

## Sequence Diagrams

### Basic Syntax

```mermaid
sequenceDiagram
    participant A
    participant B as Long Name

    A->>B: Message
    B-->>A: Response

    Note over A: Single note
    Note over A,B: Spanning note
```

### Arrow Types

- `->` Solid line without arrow
- `-->` Dotted line without arrow
- `->>` Solid line with arrow
- `-->>` Dotted line with arrow

### Common Pitfalls

❌ **Don't use br tags in participant names:**
```mermaid
participant Auth0<br/>Server
```

✅ **Use aliases instead:**
```mermaid
participant Auth0 as Auth0 Server
```

❌ **Don't use br in messages:**
```mermaid
A->>B: POST /token<br/>{ code: "..." }
```

✅ **Keep messages concise:**
```mermaid
A->>B: POST /token (code parameter)
```

### Advanced Features

```mermaid
sequenceDiagram
    autonumber

    activate A
    A->>B: Request
    deactivate A

    alt Success
        B-->>A: OK
    else Failure
        B-->>A: Error
    end

    loop Every hour
        A->>B: Poll
    end
```

## Flowcharts

### Basic Syntax

```mermaid
flowchart TD
    A[Rectangle]
    B(Rounded)
    C{Diamond}
    D([Stadium])
    E[[Subroutine]]

    A --> B
    B --> C
    C -->|Yes| D
    C -->|No| E
```

### Direction Options

- `TD` or `TB` - Top to bottom
- `BT` - Bottom to top
- `LR` - Left to right
- `RL` - Right to left

### Common Pitfalls

❌ **Don't use complex labels:**
```mermaid
flowchart TD
    A[This is a very long label<br/>with line breaks]
```

✅ **Keep labels short:**
```mermaid
flowchart TD
    A[Short label]
    B[Another step]
```

❌ **Don't use special chars unescaped:**
```mermaid
flowchart TD
    A[Step #1]
```

✅ **Use quotes for special chars:**
```mermaid
flowchart TD
    A["Step #1"]
```

## Class Diagrams

### Basic Syntax

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +eat()
        +sleep()
    }

    class Dog {
        +String breed
        +bark()
    }

    Animal <|-- Dog
```

### Relationship Types

- `<|--` Inheritance
- `*--` Composition
- `o--` Aggregation
- `-->` Association
- `--` Link (solid)
- `..>` Dependency
- `..|>` Realization

### Visibility Modifiers

- `+` Public
- `-` Private
- `#` Protected
- `~` Package/Internal

### Common Pitfalls

❌ **Don't use complex type annotations:**
```mermaid
classDiagram
    class User {
        +Map<String, List<Object>> data
    }
```

✅ **Simplify types:**
```mermaid
classDiagram
    class User {
        +Map data
        +List items
    }
```

## State Diagrams

### Basic Syntax

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing
    Processing --> Success
    Processing --> Failed
    Success --> [*]
    Failed --> [*]
```

### Composite States

```mermaid
stateDiagram-v2
    [*] --> Active

    state Active {
        [*] --> Running
        Running --> Paused
        Paused --> Running
    }

    Active --> [*]
```

### Common Pitfalls

❌ **Don't use special chars in state names:**
```mermaid
stateDiagram-v2
    [*] --> State#1
```

✅ **Use alphanumeric names:**
```mermaid
stateDiagram-v2
    [*] --> State1
```

## Entity Relationship Diagrams

### Basic Syntax

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    PRODUCT ||--o{ LINE-ITEM : includes

    USER {
        string id
        string name
        string email
    }

    ORDER {
        string id
        date created_at
        string status
    }
```

### Relationship Cardinality

- `||--||` One to one
- `||--o{` One to many
- `}o--o{` Many to many
- `||--|{` One to exactly one

### Common Pitfalls

❌ **Don't use spaces in entity names:**
```mermaid
erDiagram
    USER ACCOUNT ||--o{ ORDER : places
```

✅ **Use hyphens or camelCase:**
```mermaid
erDiagram
    USER-ACCOUNT ||--o{ ORDER : places
```

## Validation Checklist

Before finalizing a Mermaid diagram, verify:

- [ ] No `<br/>` or HTML tags anywhere
- [ ] No `style`, `fill`, or `stroke` directives
- [ ] All participant/node names are simple (no special chars)
- [ ] Line breaks are avoided or properly escaped
- [ ] Quotes used for labels with special characters
- [ ] Diagram type matches user requirements
- [ ] Syntax follows the exact patterns above

## Quick Reference: When to Use Each Diagram Type

- **Sequence**: Time-based interactions, API flows, authentication flows
- **Flowchart**: Decision trees, processes, algorithms
- **Class**: Object-oriented design, data structures
- **State**: State machines, lifecycle management
- **ER**: Database schemas, data relationships
