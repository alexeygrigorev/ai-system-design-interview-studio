# AI Engineering Interviewer Prompt Pack

This folder contains separate Markdown files for building an AI Engineering system design interviewer.

## Files

1. `01_base_ai_engineering_system_design_interviewer.md`  
   Defines the interview objective, evaluation rubric, interview flow, seniority calibration, and final feedback format.

2. `02_session_configuration.md`  
   Defines runtime variables such as candidate level, duration, interview topic, feedback mode, and constraints.

3. `03_persona_supportive_coach.md`  
   Warm, collaborative, low-pressure interviewer behavior.

4. `04_persona_neutral_evaluator.md`  
   Calm, professional, realistic rubric-driven interviewer behavior.

5. `05_persona_adversarial_challenger.md`  
   Skeptical, high-pressure, technically demanding interviewer behavior.

6. `06_stitching_template.md`  
   Shows how to combine the base prompt, session configuration, and exactly one persona behavior prompt.

## Usage

At runtime, stitch together:

```text
[BASE_PROMPT]

[SESSION_CONFIGURATION]

[ONE_PERSONA_BEHAVIOR_PROMPT]
```

The base prompt defines what to evaluate. The session configuration defines what interview to run. The persona prompt defines how the interviewer behaves.
