import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../api.config';
import { Task } from '../models/task.model';
import { TaskService } from './task.service';

describe('TaskService', () => {
  let service: TaskService;
  let httpMock: HttpTestingController;

  const sampleTask: Task = {
    id: 1,
    project_id: 10,
    title: 'Write tests',
    description: null,
    column_id: 100,
    priority: 'medium',
    assignee_id: null,
    created_by: 5,
    due_date: null,
    created_at: '2026-01-01T00:00:00Z',
    has_unread_mentions: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TaskService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Fails the test if any request went unanswered — makes sure the service
    // isn't firing requests to URLs the test never bothered to check.
    httpMock.verify();
  });

  it('lists a project\'s tasks from GET /projects/:id/tasks', () => {
    let result: Task[] | undefined;
    service.listProjectTasks(10).subscribe((tasks) => (result = tasks));

    const req = httpMock.expectOne(`${API_BASE_URL}/projects/10/tasks`);
    expect(req.request.method).toBe('GET');
    req.flush([sampleTask]);

    expect(result).toEqual([sampleTask]);
  });

  it('creates a task via POST /tasks with the given payload', () => {
    let result: Task | undefined;
    const request = { project_id: 10, title: 'Write tests', column_id: 100 };
    service.createTask(request).subscribe((task) => (result = task));

    const req = httpMock.expectOne(`${API_BASE_URL}/tasks`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sampleTask);

    expect(result).toEqual(sampleTask);
  });

  it('updates a task via PATCH /tasks/:id with the given payload', () => {
    let result: Task | undefined;
    const request = { title: 'Write more tests' };
    service.updateTask(1, request).subscribe((task) => (result = task));

    const req = httpMock.expectOne(`${API_BASE_URL}/tasks/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sampleTask, title: 'Write more tests' });

    expect(result?.title).toBe('Write more tests');
  });

  it('deletes a task via DELETE /tasks/:id', () => {
    let completed = false;
    service.deleteTask(1).subscribe(() => (completed = true));

    const req = httpMock.expectOne(`${API_BASE_URL}/tasks/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });
});
