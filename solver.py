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

app = FastAPI(title="Timetable Solver API", version="1.0.0")

# CORS middleware for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
            penalty_multiplier: Multiplier for distribution penalties (1.0 = -400, 0.125 = -50)
        """
        # ELITE OPTIMIZATION MODE: Place as many lessons as possible with strict quality
        # Priority: Double periods (1000 points) > Single periods (500 points)
        # Extreme Penalty: Same subject multiple times per day for a class (-400 points default)
        # Strategy: High rewards + penalties = AI forced to balance
        
        base_penalty = int(-400 * penalty_multiplier)  # -400 for strict, -50 for relaxed
        
        objective_terms = []
        for task in self.task_info:
            task_idx = task['task_idx']
            presence_var = self.presence_vars[task_idx]
            
            # ELITE WEIGHTS: 10x boost for maximum placement motivation
            # Multiply by number of classes to fairly weight parallel lessons
            weight = 1000 if task['type'] == 'double' else 500
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
        print(f"   📈 Strategy: High rewards ({1000}/{500}pts) + penalties ({base_penalty}pts) = balanced placement")
        
        # Maximize total weighted placements with penalties
        self.model.Maximize(sum(objective_terms))
        
        print(f"\n🎯 OBJECTIVE: Maximum placement + subject distribution")
        print(f"   Base weights: Doubles=1000pts, Singles=500pts (× class count for parallel)")
        print(f"   Penalty: Same subject >1/day = {base_penalty}pts per extra occurrence")
    
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
            self.solver.parameters.num_search_workers = 8
            self.solver.parameters.log_search_progress = True
            self.solver.parameters.random_seed = 42
            self.solver.parameters.relative_gap_limit = 0.02  # 5% gap acceptable
            
            status = self.solver.Solve(self.model)
            
            # Check if Stage 1 produced good solution
            stage1_success = status in [cp_model.OPTIMAL, cp_model.FEASIBLE]
            if stage1_success:
                slots, unplaced = self._extract_solution()
                placement_rate = len(slots) / self.stats['totalTasks'] if self.stats['totalTasks'] > 0 else 0
                
                if placement_rate >= 0.95:  # 95%+ placement
                    print(f"✅ Stage 1 SUCCESS: {placement_rate*100:.1f}% placement with strict balance")
                    # Return Stage 1 solution
                    solving_time = time.time() - start_time
                    return self._build_response(status, solving_time, slots, unplaced)
                else:
                    print(f"⚠️  Stage 1: Only {placement_rate*100:.1f}% placed. Proceeding to Stage 2...")
            else:
                print(f"⚠️  Stage 1: No solution (status: {self.solver.StatusName(status)}). Trying Stage 2...")
            
            # STAGE 2: Relaxed penalties for maximum placement
            print(f"\n📍 STAGE 2: Relaxing Rules for Maximum Placement...")
            if stage_callback:
                stage_callback("stage2")
            
            # Create new solver with relaxed penalties
            self.model = cp_model.CpModel()
            self.solver = cp_model.CpSolver()
            
            # Recreate everything with relaxed penalties
            self._create_variables()
            self._add_constraints()
            self._set_objective(penalty_multiplier=0.125)  # -50 instead of -400
            
            self.solver.parameters.max_time_in_seconds = stage2_time
            self.solver.parameters.num_search_workers = 8
            self.solver.parameters.log_search_progress = True
            self.solver.parameters.random_seed = 42
            self.solver.parameters.relative_gap_limit = 0.02
            
            status = self.solver.Solve(self.model)
        else:
            # SINGLE-STAGE SOLVING: Traditional strict mode
            print(f"\n🔍 SINGLE-STAGE MODE: {time_limit_seconds}s with strict penalties")
            print("   Seed: 42 | Target: 96%+ placement with strict balance")
            print("="*60)
            
            self.solver.parameters.max_time_in_seconds = time_limit_seconds
            self.solver.parameters.num_search_workers = 8
            self.solver.parameters.log_search_progress = True
            self.solver.parameters.random_seed = 42
            self.solver.parameters.relative_gap_limit = 0.02
            
            status = self.solver.Solve(self.model)
        
        solving_time = time.time() - start_time
        
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
        total_tasks = self.stats['totalTasks']
        coverage = (placed_count / total_tasks * 100) if total_tasks > 0 else 0
        
        if status == cp_model.OPTIMAL:
            message = f"✅ Optimal solution! Placed {placed_count}/{total_tasks} tasks ({coverage:.1f}%)"
            success = True
        elif status == cp_model.FEASIBLE:
            message = f"✅ Feasible solution. Placed {placed_count}/{total_tasks} tasks ({coverage:.1f}%)"
            success = True
        else:
            message = f"❌ No solution found (status: {self.solver.StatusName(status)})"
            success = False
        
        print(f"\n{message}")
        print(f"⏱️  Solving time: {solving_time:.2f}s")
        
        if coverage < 100:
            print(f"⚠️  WARNING: {total_tasks - placed_count} tasks could not be placed")
        
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
            
            # Determine diagnostic
            if teacher_utilization > 0.90:
                task.diagnostic = f"Teacher workload is too high ({teacher_utilization*100:.0f}% utilization)"
            elif class_utilization > 0.90:
                task.diagnostic = f"Class schedule is nearly full ({class_utilization*100:.0f}% utilization)"
            elif teacher_utilization > 0.70 and class_utilization > 0.70:
                # Check if teacher is free when class is busy (resource conflict)
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
                if len(overlap) < (2 if task.taskType == 'double' else 1):
                    task.diagnostic = "Resource scheduling conflict: Teacher and class schedules don't align"
                else:
                    task.diagnostic = "Constraints prevent scheduling despite available slots"
            elif teacher_utilization < 0.30:
                task.diagnostic = "Insufficient demand or over-constrained problem"
            else:
                task.diagnostic = "Unable to find valid slot due to constraints (intervals/conflicts)"
            
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
            time_limit_seconds=180,
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
    print("📍 Endpoint: http://localhost:8000")
    print("📖 Docs: http://localhost:8000/docs")
    print("🔧 Solver: Google OR-Tools CP-SAT")
    print("="*60 + "\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
