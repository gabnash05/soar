import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, Card, CardBody, CardHeader, Field, LoadingBlock, Select, SubtabNav, SubtabPanel, TextInput, useQueryTab } from '../../components/ui';
import { CANONICAL_DEPARTMENTS } from '../../lib/departments';
import {
  assignAdminOfficer,
  createAdminOrganization,
  listAdminOrganizations,
  searchAdminStudents,
  type AdminOrganizationOption,
  type AdminStudentOption,
  type CreateAdminOrganizationInput,
} from '../../lib/adminApi';

const adminTabs = [
  { id: 'create', label: 'Create organization' },
  { id: 'assign', label: 'Assign officers' },
];

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function StudentPicker({
  idPrefix,
  selected,
  onSelect,
}: {
  idPrefix: string;
  selected: AdminStudentOption | null;
  onSelect: (student: AdminStudentOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AdminStudentOption[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchGeneration = useRef(0);

  const runSearch = async (pageToken?: string, generation = searchGeneration.current) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLoading(false);
      setError('Enter at least two characters from the student’s name or ID.');
      setItems([]);
      setNextPageToken(undefined);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const result = await searchAdminStudents(trimmed, pageToken);
      if (generation !== searchGeneration.current) return;
      setItems((current) => {
        const combined = pageToken ? [...current, ...result.items] : result.items;
        return [...new Map(combined.map((student) => [student.uid, student])).values()];
      });
      setNextPageToken(result.nextPageToken);
    } catch (caught) {
      if (generation === searchGeneration.current) setError(messageFor(caught, 'Student accounts could not be searched. Try again.'));
    } finally {
      if (generation === searchGeneration.current) setLoading(false);
    }
  };

  const startSearch = () => {
    searchGeneration.current += 1;
    const generation = searchGeneration.current;
    setItems([]);
    setNextPageToken(undefined);
    onSelect(null);
    void runSearch(undefined, generation);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      startSearch();
    }
  };

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field id={`${idPrefix}-query`} label="Find a registered student">
          <TextInput
            id={`${idPrefix}-query`}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              searchGeneration.current += 1;
              setLoading(false);
              setQuery(event.target.value);
              setItems([]);
              setNextPageToken(undefined);
              setSearched(false);
              setError(null);
              onSelect(null);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Name or student ID"
            aria-describedby={`${idPrefix}-search-hint ${idPrefix}-search-status`}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={startSearch} disabled={loading || query.trim().length < 2} aria-busy={loading || undefined}>
          {loading ? 'Searching…' : 'Search students'}
        </Button>
      </div>

      <p id={`${idPrefix}-search-hint`} className="m-0 text-xs text-[var(--muted-foreground)]">Search saved accounts by name or existing student ID.</p>
      <p id={`${idPrefix}-search-status`} className="m-0 text-sm text-[var(--muted-foreground)]" role="status" aria-live="polite">
        {loading
          ? 'Searching saved student accounts…'
          : selected
            ? `Selected: ${selected.displayName}`
            : searched && !error && items.length === 0
              ? nextPageToken ? 'No matches in this set of saved accounts. Continue searching below.' : 'No saved student accounts match that name or ID.'
              : items.length
                ? `${items.length} matching student accounts. Choose one.`
                : 'Search by at least two characters, then choose one account.'}
      </p>
      {error ? <p className="m-0 text-sm font-bold text-[var(--color-orange-deep)]" role="alert">{error}</p> : null}
      {items.length ? (
        <fieldset className="m-0 grid min-w-0 gap-1 border-0 border-t border-[var(--color-border)] p-0 pt-2" aria-label="Matching registered students">
          <legend className="sr-only">Choose a registered student</legend>
          {items.map((student) => (
            <label
              key={student.uid}
              className="flex min-w-0 cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] px-3 py-2.5 hover:border-[var(--color-blue)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-blue-deep)]"
            >
              <input
                className="mt-1 size-4 accent-[var(--color-navy)]"
                type="radio"
                name={`${idPrefix}-student`}
                value={student.uid}
                checked={selected?.uid === student.uid}
                onChange={() => onSelect(student)}
              />
              <span className="grid min-w-0 gap-0.5">
                <strong className="break-words text-sm text-[var(--color-navy)]">{student.displayName}</strong>
                <span className="break-words text-xs text-[var(--muted-foreground)]">
                  Student ID: {student.studentId || 'not on file'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {nextPageToken ? (
        <div>
          <Button type="button" variant="quiet" disabled={loading} onClick={() => void runSearch(nextPageToken)}>
            {loading ? 'Searching…' : 'Search more saved accounts'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminProvisioningPage() {
  const { activeId, getTabTo } = useQueryTab(adminTabs.map((tab) => tab.id), 'create');
  const [organizations, setOrganizations] = useState<AdminOrganizationOption[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(true);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const [organizationPageToken, setOrganizationPageToken] = useState<string>();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [loadMoreOrganizations, setLoadMoreOrganizations] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [initialOwner, setInitialOwner] = useState<AdminStudentOption | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [ownerPickerKey, setOwnerPickerKey] = useState(0);

  const [assignmentStudent, setAssignmentStudent] = useState<AdminStudentOption | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  const loadOrganizations = useCallback(async (pageToken?: string, replace = false) => {
    if (pageToken) setLoadMoreOrganizations(true);
    else setOrganizationsLoading(true);
    setOrganizationsError(null);
    try {
      const result = await listAdminOrganizations(pageToken);
      setOrganizations((current) => replace || !pageToken ? result.items : [...current, ...result.items]);
      setOrganizationPageToken(result.nextPageToken);
    } catch (caught) {
      setOrganizationsError(messageFor(caught, 'Organizations could not be loaded. Try again.'));
    } finally {
      setOrganizationsLoading(false);
      setLoadMoreOrganizations(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateMessage(null);
    if (!initialOwner) {
      setCreateError('Search for and select a registered student as the initial organization officer.');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      setCreateError('Use a lowercase organization ID with letters, numbers, and single hyphens.');
      return;
    }

    const createdName = name.trim();
    const input: CreateAdminOrganizationInput = {
      orgId: slug.trim(),
      slug: slug.trim(),
      name: name.trim(),
      ownerUid: initialOwner.uid,
      ...(shortDescription.trim() ? { shortDescription: shortDescription.trim() } : {}),
      ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
      ...(department ? { department } : {}),
    };
    setCreateBusy(true);
    try {
      const created = await createAdminOrganization(input);
      setSelectedOrganizationId(created.orgId);
      setCreateMessage(`${createdName} was created with ${initialOwner.displayName} as its initial officer.`);
      setName('');
      setSlug('');
      setSlugEdited(false);
      setShortDescription('');
      setContactEmail('');
      setDepartment('');
      setInitialOwner(null);
      setOwnerPickerKey((current) => current + 1);
      await loadOrganizations(undefined, true);
      setOrganizations((current) => current.some((organization) => organization.id === created.orgId)
        ? current
        : [...current, { id: created.orgId, name: createdName }]);
    } catch (caught) {
      setCreateError(messageFor(caught, 'The organization could not be created. Check the details and try again.'));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleAssignOfficer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAssignmentError(null);
    setAssignmentMessage(null);
    if (!selectedOrganizationId || !assignmentStudent) {
      setAssignmentError('Choose an organization and a registered student before assigning officer access.');
      return;
    }

    setAssignmentBusy(true);
    try {
      const result = await assignAdminOfficer(selectedOrganizationId, assignmentStudent.uid);
      setAssignmentMessage(result.alreadyAssigned
        ? `${assignmentStudent.displayName} already has officer access for this organization.`
        : `${assignmentStudent.displayName} is now an officer for ${organizations.find((item) => item.id === selectedOrganizationId)?.name ?? 'this organization'}.`);
    } catch (caught) {
      setAssignmentError(messageFor(caught, 'Officer access could not be assigned. Try again.'));
    } finally {
      setAssignmentBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-[min(960px,100%)] min-w-0 gap-5">
      <header className="grid gap-1.5 border-b border-[var(--color-border)] pb-4">
        <h1 className="m-0 font-[var(--font-display)] text-[clamp(1.8rem,4vw,2.65rem)] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-navy)]">Admin setup</h1>
        <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">Create organizations and assign registered students to manage them.</p>
      </header>

      <SubtabNav label="Admin setup tasks" baseId="admin-setup" items={adminTabs} activeId={activeId} getTabTo={getTabTo} />

      <SubtabPanel baseId="admin-setup" tabId="create" activeId={activeId}>
        <Card className="grid gap-4">
          <CardHeader title="Create organization">
            Create the organization profile and choose a student as its initial officer.
          </CardHeader>
          <CardBody className="p-0">
            <form className="grid min-w-0 gap-4" onSubmit={handleCreateOrganization} aria-busy={createBusy || undefined}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field id="admin-org-name" label="Organization name">
                  <TextInput
                    id="admin-org-name"
                    value={name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setName(nextName);
                      if (!slugEdited) setSlug(nextName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                    }}
                    minLength={2}
                    maxLength={140}
                    required
                    autoComplete="organization"
                  />
                </Field>
                <Field id="admin-org-slug" label="Organization ID / URL slug" hint="Use lowercase letters, numbers, and hyphens.">
                  <TextInput
                    id="admin-org-slug"
                    value={slug}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setSlugEdited(true);
                    }}
                    minLength={2}
                    maxLength={140}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    required
                    autoComplete="off"
                  />
                </Field>
                <Field id="admin-org-contact-email" label="Contact email" optional>
                  <TextInput id="admin-org-contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} autoComplete="email" />
                </Field>
                <Field id="admin-org-department" label="Department link" optional hint="Only link an organization to a department when the match is known.">
                  <Select id="admin-org-department" value={department} onChange={(event) => setDepartment(event.target.value)}>
                    <option value="">No department link</option>
                    {CANONICAL_DEPARTMENTS.map((label) => <option value={label} key={label}>{label}</option>)}
                  </Select>
                </Field>
              </div>
              <Field id="admin-org-short-description" label="Short description" optional>
                <TextInput id="admin-org-short-description" value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} maxLength={180} />
              </Field>

              <section className="grid min-w-0 gap-3 border-t border-[var(--color-border)] pt-4" aria-label="Initial organization officer">
                <h2 className="m-0 font-[var(--font-display)] text-lg font-bold text-[var(--color-navy)]">Initial officer</h2>
                <p className="m-0 max-w-[68ch] text-sm text-[var(--muted-foreground)]">The existing organization setup requires a student owner. This selected student receives the initial organization-scoped officer grant.</p>
                <StudentPicker key={ownerPickerKey} idPrefix="initial-owner" selected={initialOwner} onSelect={setInitialOwner} />
              </section>

              {createError ? <p className="m-0 text-sm font-bold text-[var(--color-orange-deep)]" role="alert">{createError}</p> : null}
              {createMessage ? <p className="m-0 text-sm font-bold text-[var(--color-blue-deep)]" role="status" aria-live="polite">{createMessage}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={createBusy} aria-busy={createBusy || undefined}>
                  {createBusy ? 'Creating organization…' : 'Create organization'}
                </Button>
                <span className="text-sm text-[var(--muted-foreground)]">Creates the organization and its initial officer grant.</span>
              </div>
            </form>
          </CardBody>
        </Card>
      </SubtabPanel>

      <SubtabPanel baseId="admin-setup" tabId="assign" activeId={activeId}>
        <Card className="grid gap-4">
          <CardHeader title="Assign officers">
            Grant an existing student account officer access for one organization.
          </CardHeader>
          <CardBody className="p-0">
            <form className="grid min-w-0 gap-4" onSubmit={handleAssignOfficer} aria-busy={assignmentBusy || undefined}>
              {organizationsLoading ? <LoadingBlock label="Loading organizations" /> : null}
              {organizationsError ? (
                <div className="grid gap-2" role="alert">
                  <p className="m-0 text-sm text-[var(--color-orange-deep)]">{organizationsError}</p>
                  <div><Button type="button" variant="secondary" onClick={() => void loadOrganizations()}>Try again</Button></div>
                </div>
              ) : null}
              {!organizationsLoading && !organizationsError && organizations.length === 0 ? (
                <p className="m-0 text-sm text-[var(--muted-foreground)]">No organizations are available yet. Create one in the Create organization tab first.</p>
              ) : null}
              {organizations.length ? (
                <Field id="admin-org-picker" label="Organization">
                  <Select
                    id="admin-org-picker"
                    value={selectedOrganizationId}
                    onChange={(event) => {
                      setSelectedOrganizationId(event.target.value);
                      setAssignmentStudent(null);
                      setAssignmentMessage(null);
                      setAssignmentError(null);
                    }}
                    required
                  >
                    <option value="" disabled>Choose an organization</option>
                    {organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}
                  </Select>
                </Field>
              ) : null}
              {organizationPageToken ? (
                <div>
                  <Button type="button" variant="quiet" disabled={loadMoreOrganizations} onClick={() => void loadOrganizations(organizationPageToken)}>
                    {loadMoreOrganizations ? 'Loading…' : 'Load more organizations'}
                  </Button>
                </div>
              ) : null}
              {organizations.length ? (
                <StudentPicker key={selectedOrganizationId} idPrefix="officer-search" selected={assignmentStudent} onSelect={(student) => { setAssignmentStudent(student); setAssignmentMessage(null); setAssignmentError(null); }} />
              ) : null}
              {assignmentError ? <p className="m-0 text-sm font-bold text-[var(--color-orange-deep)]" role="alert">{assignmentError}</p> : null}
              {assignmentMessage ? <p className="m-0 text-sm font-bold text-[var(--color-blue-deep)]" role="status" aria-live="polite">{assignmentMessage}</p> : null}
              <div>
                <Button type="submit" disabled={assignmentBusy || organizationsLoading || organizations.length === 0} aria-busy={assignmentBusy || undefined}>
                  {assignmentBusy ? 'Assigning officer…' : 'Assign officer'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </SubtabPanel>
    </div>
  );
}
