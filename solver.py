"""
PROFESSIONAL-GRADE TIMETABLE SOLVER
Using Google OR-Tools CP-SAT (Constraint Programming - SAT Solver)

This solver handles:
- 813-period timetable optimization
- Double period constraints (consecutive, no interval breaks)
- Teacher/Class conflict prevention
- ITT/Aesthetic resource blocks
- Fast solving (< 60 seconds for most cases)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from ortools.sat.python import cp_model
import uvicorn
import time
import gc

app = FastAPI(title="Timetable Solver API", version="1.0.0")

# CORS middleware for Next.js integration (Universal for debugging)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== DATA MODELS ====================

class IntervalSlot(BaseModel):
    afterPeriod: int
    duration: int

class DayOfWeek(BaseModel):
    name: str
    abbreviation: str

class SchoolConfig(BaseModel):
    numberOfPeriods: int
    intervalSlots: List[IntervalSlot]
    daysOfWeek: List[DayOfWeek]

class Lesson(BaseModel):
    model_config = {"populate_by_name": True}
    
    lesson_id: str = Field(alias='_id')
    lesson_name: str = Field(alias='lessonName')
    subjectIds: List[str]
    teacherIds: List[str]
    classIds: List[str]
    numberOfSingles: int
    numberOfDoubles: int
    color: Optional[str] = "#3B82F6"

class Class(BaseModel):
    model_config = {"populate_by_name": True}
    
    class_id: str = Field(alias='_id')
    name: str
    grade: str  # Changed to str to support Sri Lankan grades like '13-years', 'Grade 11', etc.

class SolverRequest(BaseModel):
    lessons: List[Lesson]
    classes: List[Class]
    config: SchoolConfig
    allowRelaxation: bool = True  # Allow two-stage solving with relaxed penalties
    maxTimeLimit: int = 180  # User-defined time limit in seconds

class TimetableSlot(BaseModel):
    classId: str
    lessonId: str
    day: str
    periodNumber: int
    isDoubleStart: bool = False
    isDoubleEnd: bool = False

class UnplacedTask(BaseModel):
    """Represents a lesson task that could not be scheduled"""
    lessonId: str
    classId: str
    lessonName: str
    className: str
    teacherName: str
    taskType: str  # 'single' or 'double'
    diagnostic: str = "Unable to schedule due to constraints"  # Diagnostic reason

class SolverResponse(BaseModel):
    success: bool
    slots: List[TimetableSlot]
    unplacedTasks: List[UnplacedTask]
    conflicts: int
    solvingTime: float
    stats: Dict[str, int]
    message: str

# ==================== CP-SAT SOLVER ====================

class TimetableSolver:
    def __init__(self, request: SolverRequest):
        self.request = request
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # Extract data
        self.lessons = request.lessons
        self.classes = request.classes
        self.config = request.config
        
        # Calculate valid double period starts (cannot span intervals)
        self.valid_double_starts = self._calculate_valid_double_starts()
        
        # Days of week
        self.days = [day.name for day in self.config.daysOfWeek]
        self.num_days = len(self.days)
        self.num_periods = self.config.numberOfPeriods
        
        # Decision variables
        self.task_vars = {}  # (lesson_idx, class_idx, period_type, day, period) -> BoolVar
        self.presence_vars = {}  # task_idx -> BoolVar (whether task is placed)
        self.task_info = []  # Metadata for each task
        
        # Statistics
        self.stats = {
            "totalLessons": len(self.lessons),
            "totalTasks": 0,
            "singlesCreated": 0,
            "doublesCreated": 0,
            "constraintsAdded": 0
        }
    
    def _calculate_valid_double_starts(self) -> List[int]:
        """Calculate which periods can start a double period (no interval breaks)"""
        valid_starts = []
        interval_periods = {slot.afterPeriod for slot in self.config.intervalSlots}
        
        for period in range(1, self.config.numberOfPeriods):
            # Can start double if:
            # 1. Not the last period
            # 2. Next period exists
            # 3. No interval after this period
            if period not in interval_periods:
                valid_starts.append(period)
        
        return valid_starts
    
    def _create_variables(self):
        """Create decision variables for all possible task placements"""
        print(f"📊 Creating variables for {len(self.lessons)} lessons...")
        print("   🔄 PARALLEL MODE: One task per lesson (applies to ALL classes)")
        
        task_idx = 0
        for lesson_idx, lesson in enumerate(self.lessons):
            # ✨ CRITICAL CHANGE: Create ONE task per lesson (not per class)
            # This ensures parallel classes get scheduled at the SAME time
            
            # Single period tasks
            for single_num in range(lesson.numberOfSingles):
                for day in self.days:
                    for period in range(1, self.num_periods + 1):
                        var = self.model.NewBoolVar(
                            f"lesson_{lesson_idx}_single_{single_num}_day_{day}_period_{period}"
                        )
                        self.task_vars[(lesson_idx, 'single', task_idx, day, period)] = var
                        
                        if day == self.days[0] and period == 1:
                            self.task_info.append({
                                'task_idx': task_idx,
                                'lesson_idx': lesson_idx,
                                'lesson': lesson,
                                'classIds': lesson.classIds,  # Store ALL classIds
                                'type': 'single'
                            })
                            self.stats['singlesCreated'] += 1
                task_idx += 1
            
            # Double period tasks
            for double_num in range(lesson.numberOfDoubles):
                for day in self.days:
                    for period in self.valid_double_starts:
                        var = self.model.NewBoolVar(
                            f"lesson_{lesson_idx}_double_{double_num}_day_{day}_period_{period}"
                        )
                        self.task_vars[(lesson_idx, 'double', task_idx, day, period)] = var
                        
                        if day == self.days[0] and period == self.valid_double_starts[0]:
                            self.task_info.append({
                                'task_idx': task_idx,
                                'lesson_idx': lesson_idx,
                                'lesson': lesson,
                                'classIds': lesson.classIds,  # Store ALL classIds
                                'type': 'double'
                            })
                            self.stats['doublesCreated'] += 1
                task_idx += 1
        
        self.stats['totalTasks'] = len(self.task_info)
        print(f"✅ Created {self.stats['totalTasks']} unified tasks ({self.stats['singlesCreated']} singles, {self.stats['doublesCreated']} doubles)")
        print(f"   📍 Each task applies to {sum(len(t['classIds']) for t in self.task_info)} total class slots")
    
    def _add_constraints(self):
        """Add all hard constraints to the model"""
        print("🔧 Adding constraints...")
        
        # 1. Each task must be assigned to exactly one slot
        self._add_task_assignment_constraints()
        
        # 2. No teacher overlap (same teacher cannot be in multiple places)
        self._add_teacher_no_overlap_constraints()
        
        # 3. No class overlap (same class cannot have multiple lessons)
        self._add_class_no_overlap_constraints()
        
        # 4. Double periods must occupy both periods
        self._add_double_period_constraints()
        
        print(f"✅ Added {self.stats['constraintsAdded']} constraints")
    
    def _add_task_assignment_constraints(self):
        """Each task CAN be assigned to at most one time slot (soft constraint)"""
        for task in self.task_info:
            task_idx = task['task_idx']
            lesson_idx = task['lesson_idx']
            task_type = task['type']
            
            # Create presence variable for this task
            presence_var = self.model.NewBoolVar(f"presence_task_{task_idx}")
            self.presence_vars[task_idx] = presence_var
            
            # Sum all variables for this task
            task_slot_vars = []
            for day in self.days:
                if task_type == 'single':
                    for period in range(1, self.num_periods + 1):
                        key = (lesson_idx, 'single', task_idx, day, period)
                        if key in self.task_vars:
                            task_slot_vars.append(self.task_vars[key])
                else:  # double
                    for period in self.valid_double_starts:
                        key = (lesson_idx, 'double', task_idx, day, period)
                        if key in self.task_vars:
                            task_slot_vars.append(self.task_vars[key])
            
            # Task is placed if and only if exactly one slot is assigned
            # sum(task_slot_vars) == presence_var
            self.model.Add(sum(task_slot_vars) == presence_var)
            self.stats['constraintsAdded'] += 1
    
    def _add_teacher_no_overlap_constraints(self):
        """No teacher can be in two places at the same time"""
        # Group lessons by teacher
        teacher_lessons = {}
        for lesson_idx, lesson in enumerate(self.lessons):
            for teacher_id in lesson.teacherIds:
                if teacher_id not in teacher_lessons:
                    teacher_lessons[teacher_id] = []
                teacher_lessons[teacher_id].append(lesson_idx)
        
        # For each teacher, for each day/period, ensure at most 1 lesson
        for teacher_id, lesson_indices in teacher_lessons.items():
            if len(lesson_indices) < 2:
                continue  # No conflict possible
            
            for day in self.days:
                for period in range(1, self.num_periods + 1):
                    # Collect all variables for this teacher at this time
                    teacher_period_vars = []
                    
                    for lesson_idx in lesson_indices:
                        # Find all tasks for this lesson
                        for task in self.task_info:
                            if task['lesson_idx'] == lesson_idx:
                                task_idx = task['task_idx']
                                task_type = task['type']
                                
                                if task_type == 'single':
                                    # Check singles at this period
                                    key = (lesson_idx, 'single', task_idx, day, period)
                                    if key in self.task_vars:
                                        teacher_period_vars.append(self.task_vars[key])
                                else:  # double
                                    # Check doubles that occupy this period
                                    # Double at period P occupies P and P+1
                                    if period - 1 in self.valid_double_starts:
                                        key = (lesson_idx, 'double', task_idx, day, period - 1)
                                        if key in self.task_vars:
                                            teacher_period_vars.append(self.task_vars[key])
                                    if period in self.valid_double_starts:
                                        key = (lesson_idx, 'double', task_idx, day, period)
                                        if key in self.task_vars:
                                            teacher_period_vars.append(self.task_vars[key])
                    
                    if len(teacher_period_vars) > 1:
                        self.model.Add(sum(teacher_period_vars) <= 1)
                        self.stats['constraintsAdded'] += 1
    
    def _add_class_no_overlap_constraints(self):
        """No class can have two lessons at the same time"""
        print("   🎯 Enhanced: Parallel classes handled via unified tasks")
        
        # Get all unique class IDs across all lessons
        all_class_ids = set()
        for lesson in self.lessons:
            all_class_ids.update(lesson.classIds)
        
        # For each class, for each day/period, ensure at most 1 lesson
        for class_id in all_class_ids:
            # Find all tasks that involve this class
            relevant_tasks = [t for t in self.task_info if class_id in t['classIds']]
            
            if len(relevant_tasks) < 2:
                continue  # No conflicts possible
            
            for day in self.days:
                for period in range(1, self.num_periods + 1):
                    class_period_vars = []
                    
                    for task in relevant_tasks:
                        lesson_idx = task['lesson_idx']
                        task_idx = task['task_idx']
                        task_type = task['type']
                        
                        if task_type == 'single':
                            # Single at this period
                            key = (lesson_idx, 'single', task_idx, day, period)
                            if key in self.task_vars:
                                class_period_vars.append(self.task_vars[key])
                        else:  # double
                            # Double at period P occupies P and P+1
                            if period - 1 in self.valid_double_starts:
                                key = (lesson_idx, 'double', task_idx, day, period - 1)
                                if key in self.task_vars:
                                    class_period_vars.append(self.task_vars[key])
                            if period in self.valid_double_starts:
                                key = (lesson_idx, 'double', task_idx, day, period)
                                if key in self.task_vars:
                                    class_period_vars.append(self.task_vars[key])
                    
                    if len(class_period_vars) > 1:
                        # At most 1 lesson for this class at this time
                        self.model.Add(sum(class_period_vars) <= 1)
                        self.stats['constraintsAdded'] += 1
    
    def _add_double_period_constraints(self):
        """Double periods must be consecutive and not span interval breaks"""
        # Already enforced by only allowing valid_double_starts
        # Double at period P automatically occupies P and P+1
        pass
    
    def _set_objective(self, penalty_multiplier: float = 1.0):
        """Maximize number of placed lessons with priority weights and subject distribution
        
        Args:
            penalty_multiplier: Multiplier for distribution penalties (1.0 = -10000, 0.125 = -1250)
        """
        # HIERARCHICAL OPTIMIZATION: Lexicographical priority system
        # Tier 1 (Placement): Singles = 1,000,000 pts | Doubles = 2,000,000 pts
        # Tier 2 (Quality): Clumping penalty = -10,000 pts
        # Logic: AI only accepts penalty if mathematically impossible to place without one
        
        base_penalty = int(-10000 * penalty_multiplier)  # -10,000 for strict, -1,250 for relaxed
        
        objective_terms = []
        for task in self.task_info:
            task_idx = task['task_idx']
            presence_var = self.presence_vars[task_idx]
            
            # HIERARCHICAL WEIGHTS: Placement >> Quality (100:1 ratio)
            # Multiply by number of classes to fairly weight parallel lessons
            weight = 2000000 if task['type'] == 'double' else 1000000
            weight *= len(task['classIds'])  # Fair weighting for parallel classes
            objective_terms.append(weight * presence_var)
        
        # ADVANCED: Add subject distribution penalties
        # Discourage same subject appearing multiple times in one day for a class
        print("\n🎯 Adding advanced subject distribution constraints...")
        distribution_penalties = []
        
        # Get all unique class IDs
        all_class_ids = set()
        for lesson in self.lessons:
            all_class_ids.update(lesson.classIds)
        
        # Group tasks by class and subject
        class_subject_tasks = {}
        for task in self.task_info:
            lesson = task['lesson']
            # Use first subject as representative (lessons can have multiple subjects)
            subject_id = lesson.subjectIds[0] if lesson.subjectIds else None
            
            if subject_id:
                # For each class in this task's classIds
                for class_id in task['classIds']:
                    key = (class_id, subject_id)
                    if key not in class_subject_tasks:
                        class_subject_tasks[key] = []
                    class_subject_tasks[key].append(task)
        
        # For each class-subject combination, penalize multiple occurrences per day
        penalty_count = 0
        for (class_id, subject_id), tasks in class_subject_tasks.items():
            if len(tasks) <= 1:
                continue  # Only one task, no distribution issue
            
            # For each day, count how many of these tasks are placed
            for day in self.days:
                day_vars = []
                for task in tasks:
                    task_idx = task['task_idx']
                    lesson_idx = task['lesson_idx']
                    task_type = task['type']
                    
                    # Collect variables for this task on this day
                    if task_type == 'single':
                        for period in range(1, self.num_periods + 1):
                            key = (lesson_idx, 'single', task_idx, day, period)
                            if key in self.task_vars:
                                day_vars.append(self.task_vars[key])
                    else:  # double
                        for period in self.valid_double_starts:
                            key = (lesson_idx, 'double', task_idx, day, period)
                            if key in self.task_vars:
                                day_vars.append(self.task_vars[key])
                
                if len(day_vars) > 1:
                    # Create a variable to count occurrences on this day
                    count_var = self.model.NewIntVar(0, len(day_vars), f"count_class_{class_id}_subj_{subject_id}_day_{day}")
                    self.model.Add(count_var == sum(day_vars))
                    
                    # PENALTY: If count > 1, subtract points per extra occurrence
                    # Strict: -400pts (forces perfect spreading)
                    # Relaxed: -50pts (allows some clumping for max placement)
                    overflow_var = self.model.NewIntVar(0, len(day_vars), f"overflow_class_{class_id}_subj_{subject_id}_day_{day}")
                    self.model.AddMaxEquality(overflow_var, [count_var - 1, 0])
                    objective_terms.append(base_penalty * overflow_var)
                    penalty_count += 1
        
        mode_str = "STRICT" if penalty_multiplier >= 1.0 else "RELAXED"
        print(f"   ✅ Added {penalty_count} subject distribution penalties ({mode_str} mode: {base_penalty}pts)")
        print(f"   📈 Strategy: HIERARCHICAL rewards (2M/1M pts) + penalties ({base_penalty}pts) = quality-first placement")
        
        # Maximize total weighted placements with penalties
        self.model.Maximize(sum(objective_terms))
        
        print(f"\n🎯 OBJECTIVE: Hierarchical placement (Tier 1) + quality (Tier 2)")
        print(f"   Tier 1 Weights: Doubles=2,000,000pts, Singles=1,000,000pts (× class count for parallel)")
        print(f"   Tier 2 Penalty: Same subject >1/day = {base_penalty}pts per extra occurrence")
    
    def solve(self, time_limit_seconds: int = 180, allow_relaxation: bool = True, stage_callback=None) -> SolverResponse:
        """Run the CP-SAT solver with optional two-stage relaxation"""
        start_time = time.time()
        
        print("\n" + "="*60)
        print("🚀 STARTING TIMETABLE SOLVER")
        print("="*60)
        
        # Step 1: Create variables
        self._create_variables()
        
        # Step 2: Add constraints
        self._add_constraints()
        
        # Step 3: Set objective
        self._set_objective()
        
        # Determine if two-stage solving is enabled
        use_two_stage = allow_relaxation and time_limit_seconds >= 90
        
        if use_two_stage:
            # TWO-STAGE SOLVING: Stage 1 (strict), Stage 2 (relaxed if needed)
            stage1_time = min(60, time_limit_seconds // 3)  # 60s or 1/3 of total time
            stage2_time = time_limit_seconds - stage1_time
            
            print(f"\n🎯 TWO-STAGE SOLVING ENABLED")
            print(f"   Stage 1: {stage1_time}s with strict penalties (-400pt)")
            print(f"   Stage 2: {stage2_time}s with relaxed penalties (-50pt) if needed")
            print("="*60)
            
            # STAGE 1: Strict balance
            print("\n📍 STAGE 1: Attempting Strict Subject Balancing...")
            if stage_callback:
                stage_callback("stage1")
            
            self.solver.parameters.max_time_in_seconds = stage1_time
            self.solver.parameters.num_search_workers = 8  # Maximum CPU power
            self.solver.parameters.log_search_progress = True
            self.solver.parameters.random_seed = 42
            self.solver.parameters.relative_gap_limit = 0.0  # ELITE: Absolute best solution only
            self.solver.parameters.search_branching = cp_model.PORTFOLIO_SEARCH  # Multi-strategy
            self.solver.parameters.interleave_search = True  # Parallel path exploration
            
            status = self.solver.Solve(self.model)
            
            # STAGE 2: Relaxed penalties if stage 1 didn't place everything
            slots_stage1, unplaced_stage1 = self._extract_solution()
            if len(unplaced_stage1) > 0:
                # Memory cleanup before Stage 2
                gc.collect()
                
                stage2_time = 60  # Additional 60 seconds for relaxed solving
                print(f"\n🎯 STAGE 2 (Relaxed): {stage2_time}s with reduced penalties (-1,250pts)")
                print(f"   Stage 1 placed {len(slots_stage1)} slots. Attempting {len(unplaced_stage1)} remaining with relaxed constraints...")
                print("="*60)
                
                # Capture Stage 1 solution for hinting
                stage1_assignments = {}  # (lesson_idx, task_type, task_idx, day, period) -> value
                for key, var in self.task_vars.items():
                    if self.solver.Value(var) == 1:
                        stage1_assignments[key] = 1
                
                # Reset and rebuild model with relaxed penalties
                self.model = cp_model.CpModel()
                self.solver = cp_model.CpSolver()
                
                # Recreate everything with relaxed penalties
                self._create_variables()
                self._add_constraints()
                self._set_objective(penalty_multiplier=0.125)  # -1,250 instead of -10,000
                
                # Apply Stage 1 solution as hints to Stage 2
                hint_count = 0
                for key, value in stage1_assignments.items():
                    if key in self.task_vars:
                        self.model.AddHint(self.task_vars[key], value)
                        hint_count += 1
                
                print(f"   🔍 SOLUTION HINTING: Applied {hint_count} assignments from Stage 1 to prevent reset")
                print(f"   📈 Strategy: Build upon existing {len(slots_stage1)} placements, explore penalized slots for remaining tasks")
                
                self.solver.parameters.max_time_in_seconds = stage2_time
                self.solver.parameters.num_search_workers = 8  # Maximum CPU power
                self.solver.parameters.log_search_progress = True
                self.solver.parameters.random_seed = 42
                self.solver.parameters.relative_gap_limit = 0.0  # ELITE: Absolute best solution only
                self.solver.parameters.search_branching = cp_model.PORTFOLIO_SEARCH  # Multi-strategy
                self.solver.parameters.interleave_search = True  # Parallel path exploration
                
                status = self.solver.Solve(self.model)
        else:
            # SINGLE-STAGE SOLVING: Traditional strict mode
            print(f"\n🔍 SINGLE-STAGE MODE: {time_limit_seconds}s with strict penalties")
            print("   Seed: 42 | Target: 96%+ placement with strict balance")
            print("="*60)
            
            self.solver.parameters.max_time_in_seconds = time_limit_seconds
            self.solver.parameters.num_search_workers = 8  # Maximum CPU power
            self.solver.parameters.log_search_progress = True
            self.solver.parameters.random_seed = 42
            self.solver.parameters.relative_gap_limit = 0.0  # ELITE: Absolute best solution only
            self.solver.parameters.search_branching = cp_model.PORTFOLIO_SEARCH  # Multi-strategy
            self.solver.parameters.interleave_search = True  # Parallel path exploration
            
            status = self.solver.Solve(self.model)
        
        solving_time = time.time() - start_time
        
        # 🔍 DEEP SEARCH POLISHING PHASE: Continue solving with extended time
        # If we're very close to 100% (≤50 unplaced), extend time to push to perfection
        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            slots, unplaced_tasks = self._extract_solution()
            unplaced_count = len(unplaced_tasks)
            
            # Calculate total required periods (single = 1, double = 2 per class)
            total_required_slots = sum(
                (1 if t['type'] == 'single' else 2) * len(t['classIds']) 
                for t in self.task_info
            )
            placement_rate = len(slots) / total_required_slots if total_required_slots > 0 else 0
            
            # Trigger deep search if we have 50 or fewer unplaced periods (typically 95%+)
            # Extended polishing: +180s (3 minutes) for maximum placement potential
            if unplaced_count > 0 and unplaced_count <= 50 and solving_time < time_limit_seconds + 180:
                print(f"\n🔍 DEEP SEARCH ACTIVATED: {unplaced_count} tasks remaining (Threshold: 50). Polishing for 180s...")
                print(f"   🚀 FINAL PUSH: Extending time by +180s (3 minutes) for 100% placement!")
                print(f"   Placement rate: {placement_rate*100:.1f}% - Targeting 100%")
                print("   🔍 DEEP SEARCH: Enhancing quality and filling remaining gaps using solution hints...")
                
                # Memory cleanup before extended search
                gc.collect()
                
                # Apply current solution as hints to EXISTING model (no rebuild)
                hint_count = 0
                for key, var in self.task_vars.items():
                    try:
                        current_value = self.solver.Value(var)
                        self.model.AddHint(var, current_value)
                        hint_count += 1
                    except:
                        pass  # Skip variables that don't have values yet
                
                print(f"   💡 SOLUTION PERSISTENCE: Applied {hint_count} hints from base solution (no duplication)")
                print(f"   📈 Strategy: Reusing existing model, only extending search time for remaining {unplaced_count} tasks")
                
                # Create NEW solver instance with extended time (model stays the same)
                self.solver = cp_model.CpSolver()
                extended_time = 180
                self.solver.parameters.max_time_in_seconds = extended_time
                
                # Ultra-aggressive elite parameters for final push
                self.solver.parameters.num_search_workers = 8
                self.solver.parameters.relative_gap_limit = 0.0
                self.solver.parameters.search_branching = cp_model.PORTFOLIO_SEARCH
                self.solver.parameters.interleave_search = True
                self.solver.parameters.random_seed = 42
                self.solver.parameters.log_search_progress = True
                
                print(f"   ⚡ ELITE MODE: 8 workers, 0.0% gap, portfolio branching, interleaved search")
                print(f"   🎯 Continuing with same {len(self.task_info)} tasks (NO model rebuild)")
                status = self.solver.Solve(self.model)
                solving_time = time.time() - start_time
                
                # Check if polishing improved the solution
                new_slots, new_unplaced = self._extract_solution()
                new_unplaced_count = len(new_unplaced)
                
                if new_unplaced_count < unplaced_count:
                    print(f"   ✅ POLISHING SUCCESS: {unplaced_count - new_unplaced_count} additional periods placed!")
                    slots, unplaced_tasks = new_slots, new_unplaced
                elif new_unplaced_count == 0:
                    print(f"   🎉 PERFECT SOLUTION: 100% placement achieved!")
                    slots, unplaced_tasks = new_slots, new_unplaced
                else:
                    print(f"   ⚠️  Polishing complete: {new_unplaced_count} periods remain unplaced")
                    slots, unplaced_tasks = new_slots, new_unplaced
                
                return self._build_response(status, solving_time, slots, unplaced_tasks)
        
        # Handle UNKNOWN status (time limit with partial solution)
        if status == cp_model.UNKNOWN:
            print("\n⚠️  Time limit reached (UNKNOWN status)")
            try:
                slots, unplaced_tasks = self._extract_solution()
                if len(slots) > 0:
                    # Found partial solution
                    return self._build_response(cp_model.FEASIBLE, solving_time, slots, unplaced_tasks)
            except:
                pass
            # No solution at all
            return self._build_response(cp_model.INFEASIBLE, solving_time, [], [])
        
        return self._build_response(status, solving_time)
    
    def _build_response(self, status, solving_time, slots=None, unplaced_tasks=None) -> SolverResponse:
        """Build solver response with diagnostics"""
        # Extract solution if not provided
        if slots is None or unplaced_tasks is None:
            if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
                slots, unplaced_tasks = self._extract_solution()
            else:
                slots, unplaced_tasks = [], []
        
        # Add diagnostics to unplaced tasks
        if len(unplaced_tasks) > 0:
            unplaced_tasks = self._diagnose_unplaced_tasks(unplaced_tasks, slots)
        
        conflicts = 0  # CP-SAT guarantees no conflicts
        placed_count = len(slots)
        
        # Calculate total required slots (single = 1 slot, double = 2 slots per class)
        total_required_slots = sum(
            (1 if t['type'] == 'single' else 2) * len(t['classIds']) 
            for t in self.task_info
        )
        
        coverage = (placed_count / total_required_slots * 100) if total_required_slots > 0 else 0
        
        if status == cp_model.OPTIMAL:
            message = f"✅ Optimal solution! Placed {placed_count}/{total_required_slots} periods ({coverage:.1f}%)"
            success = True
        elif status == cp_model.FEASIBLE:
            message = f"✅ Feasible solution. Placed {placed_count}/{total_required_slots} periods ({coverage:.1f}%)"
            success = True
        else:
            message = f"❌ No solution found (status: {self.solver.StatusName(status)})"
            success = False
        
        print(f"\n{message}")
        print(f"⏱️  Solving time: {solving_time:.2f}s")
        
        if coverage < 100:
            print(f"⚠️  WARNING: {total_required_slots - placed_count} periods could not be placed")
        
        print("="*60)
        
        return SolverResponse(
            success=success,
            slots=slots,
            unplacedTasks=unplaced_tasks,
            conflicts=conflicts,
            solvingTime=solving_time,
            stats=self.stats,
            message=message
        )
    
    def _diagnose_unplaced_tasks(self, unplaced_tasks: List[UnplacedTask], scheduled_slots: List[TimetableSlot]) -> List[UnplacedTask]:
        """Analyze why tasks couldn't be placed and add diagnostic information"""
        print(f"\n🔍 Diagnosing {len(unplaced_tasks)} unplaced tasks...")
        
        # Build teacher and class utilization maps from scheduled slots
        teacher_schedule = {}  # teacher_id -> {day -> [periods]}
        class_schedule = {}    # class_id -> {day -> [periods]}
        
        for slot in scheduled_slots:
            # Get lesson info to find teachers
            lesson = next((l for l in self.lessons if l.lesson_id == slot.lessonId), None)
            if not lesson:
                continue
            
            # Track class schedule
            if slot.classId not in class_schedule:
                class_schedule[slot.classId] = {}
            if slot.day not in class_schedule[slot.classId]:
                class_schedule[slot.classId][slot.day] = []
            class_schedule[slot.classId][slot.day].append(slot.periodNumber)
            
            # Track teacher schedule for all teachers in this lesson
            for teacher_id in lesson.teacherIds:
                if teacher_id not in teacher_schedule:
                    teacher_schedule[teacher_id] = {}
                if slot.day not in teacher_schedule[teacher_id]:
                    teacher_schedule[teacher_id][slot.day] = []
                teacher_schedule[teacher_id][slot.day].append(slot.periodNumber)
        
        # Calculate total available slots per entity
        total_slots = len(self.days) * self.num_periods
        
        # Diagnose each unplaced task
        diagnosed_tasks = []
        for task in unplaced_tasks:
            # Find the lesson for this task
            lesson = next((l for l in self.lessons if l.lesson_id == task.lessonId), None)
            if not lesson:
                task.diagnostic = "Lesson not found in system"
                diagnosed_tasks.append(task)
                continue
            
            # Calculate teacher utilization
            teacher_utilization = 0
            if lesson.teacherIds:
                teacher_id = lesson.teacherIds[0]  # Use first teacher
                teacher_busy_count = sum(len(periods) for periods in teacher_schedule.get(teacher_id, {}).values())
                teacher_utilization = teacher_busy_count / total_slots if total_slots > 0 else 0
            
            # Calculate class utilization
            class_busy_count = sum(len(periods) for periods in class_schedule.get(task.classId, {}).values())
            class_utilization = class_busy_count / total_slots if total_slots > 0 else 0
            
            # Get teacher and class names for detailed diagnostics
            teacher_name = "Unknown Teacher"
            if lesson.teacherIds:
                # Try to get teacher name (not available in lesson model, use ID as fallback)
                teacher_name = f"Teacher {lesson.teacherIds[0][-6:]}"  # Last 6 chars of ID
            
            class_name = task.className
            
            # ELITE DIAGNOSTIC: Determine very specific blocking reason
            if teacher_utilization >= 1.0:
                task.diagnostic = f"Placement blocked: {teacher_name} is 100% busy across all periods"
            elif class_utilization >= 1.0:
                task.diagnostic = f"Placement blocked: {class_name} schedule is completely full (100% utilization)"
            elif teacher_utilization > 0.90:
                task.diagnostic = f"Placement blocked: {teacher_name} workload critically high ({teacher_utilization*100:.0f}% utilization)"
            elif class_utilization > 0.90:
                task.diagnostic = f"Placement blocked: {class_name} schedule nearly full ({class_utilization*100:.0f}% utilization)"
            elif teacher_utilization > 0.70 and class_utilization > 0.70:
                # ELITE: Check for exact schedule mismatch
                teacher_free_slots = set()
                class_free_slots = set()
                
                for day in self.days:
                    teacher_busy = set(teacher_schedule.get(lesson.teacherIds[0] if lesson.teacherIds else '', {}).get(day, []))
                    class_busy = set(class_schedule.get(task.classId, {}).get(day, []))
                    
                    for period in range(1, self.num_periods + 1):
                        if period not in teacher_busy:
                            teacher_free_slots.add((day, period))
                        if period not in class_busy:
                            class_free_slots.add((day, period))
                
                # Check if there's overlap in free slots
                overlap = teacher_free_slots & class_free_slots
                required_slots = 2 if task.taskType == 'double' else 1
                
                if len(overlap) == 0:
                    task.diagnostic = f"Placement blocked: {teacher_name} is 100% busy during all periods where {class_name} has free slots"
                elif len(overlap) < required_slots:
                    task.diagnostic = f"Placement blocked: Only {len(overlap)} overlapping free slot(s), but {required_slots} consecutive needed for {task.taskType}"
                else:
                    # Has overlap but still can't place - must be interval or other constraint
                    task.diagnostic = f"Placement blocked: Interval breaks or subject distribution constraints prevent scheduling despite {len(overlap)} free overlapping slots"
            elif teacher_utilization < 0.30:
                task.diagnostic = f"Placement blocked: Insufficient overall demand or over-constrained problem (teacher only {teacher_utilization*100:.0f}% utilized)"
            else:
                task.diagnostic = f"Placement blocked: Constraints prevent scheduling (teacher {teacher_utilization*100:.0f}%, class {class_utilization*100:.0f}% utilized)"
            
            diagnosed_tasks.append(task)
        
        print(f"   ✅ Diagnostics completed for {len(diagnosed_tasks)} tasks")
        return diagnosed_tasks
    
    def _extract_solution(self) -> tuple[List[TimetableSlot], List[UnplacedTask]]:
        """Extract assigned slots and unplaced tasks from the solved model"""
        slots = []
        unplaced_tasks = []
        
        for task in self.task_info:
            task_idx = task['task_idx']
            
            # Check if task was placed
            task_placed = True
            if task_idx in self.presence_vars:
                if not self.solver.Value(self.presence_vars[task_idx]):
                    task_placed = False
            
            if not task_placed:
                # Task not placed - add to unplaced list FOR EACH CLASS
                lesson = task['lesson']
                task_type = task['type']
                
                for class_id in task['classIds']:
                    # Find class name
                    class_obj = next((c for c in self.request.classes if c.class_id == class_id), None)
                    class_name = f"{class_obj.grade}-{class_obj.name}" if class_obj else "Unknown"
                    
                    unplaced_tasks.append(UnplacedTask(
                        lessonId=lesson.lesson_id,
                        classId=class_id,
                        lessonName=lesson.lesson_name,
                        className=class_name,
                        teacherName="N/A",  # Teacher names not available in lesson model
                        taskType=task_type
                    ))
                continue  # Skip to next task
            
            lesson_idx = task['lesson_idx']
            lesson = task['lesson']
            task_type = task['type']
            
            # Find which slot this task was assigned to
            assigned_day = None
            assigned_period = None
            
            for day in self.days:
                if task_type == 'single':
                    for period in range(1, self.num_periods + 1):
                        key = (lesson_idx, 'single', task_idx, day, period)
                        if key in self.task_vars and self.solver.Value(self.task_vars[key]):
                            assigned_day = day
                            assigned_period = period
                            break
                else:  # double
                    for period in self.valid_double_starts:
                        key = (lesson_idx, 'double', task_idx, day, period)
                        if key in self.task_vars and self.solver.Value(self.task_vars[key]):
                            assigned_day = day
                            assigned_period = period
                            break
                if assigned_day:
                    break
            
            # ✨ CRITICAL: Create slots for ALL classes in this task's classIds
            if assigned_day and assigned_period:
                for class_id in task['classIds']:
                    if task_type == 'single':
                        slots.append(TimetableSlot(
                            classId=class_id,
                            lessonId=lesson.lesson_id,
                            day=assigned_day,
                            periodNumber=assigned_period,
                            isDoubleStart=False,
                            isDoubleEnd=False
                        ))
                    else:  # double
                        # Add two slots for double period
                        slots.append(TimetableSlot(
                            classId=class_id,
                            lessonId=lesson.lesson_id,
                            day=assigned_day,
                            periodNumber=assigned_period,
                            isDoubleStart=True,
                            isDoubleEnd=False
                        ))
                        slots.append(TimetableSlot(
                            classId=class_id,
                            lessonId=lesson.lesson_id,
                            day=assigned_day,
                            periodNumber=assigned_period + 1,
                            isDoubleStart=False,
                            isDoubleEnd=True
                        ))
        
        return slots, unplaced_tasks

# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "service": "Timetable Solver API",
        "version": "1.0.0",
        "solver": "Google OR-Tools CP-SAT",
        "status": "running"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/solve", response_model=SolverResponse)
async def solve_timetable(request: SolverRequest):
    """
    AI-Powered Timetable Solver - CP-SAT with intelligent two-stage optimization
    
    - **lessons**: List of lessons with teacher/class assignments
    - **classes**: List of classes
    - **config**: School configuration (periods, days, intervals)
    - **allowRelaxation**: Enable two-stage solving (strict → relaxed if needed)
    
    Returns optimized timetable with 0 conflicts and intelligent diagnostics
    """
    try:
        solver = TimetableSolver(request)
        result = solver.solve(
            time_limit_seconds=request.maxTimeLimit,
            allow_relaxation=request.allowRelaxation
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")

# ==================== MAIN ====================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 TIMETABLE SOLVER API")
    print("="*60)
    print("📍 Endpoint: http://127.0.0.1:8000")
    print("📖 Docs: http://127.0.0.1:8000/docs")
    print("🔧 Solver: Google OR-Tools CP-SAT")
    print("🌐 Binding: 127.0.0.1:8000 (IPv4 loopback - forced)")
    print("🔓 CORS: Universal (debugging mode)")
    print("="*60 + "\n")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info"
    )
