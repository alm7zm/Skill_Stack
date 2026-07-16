-- Move the certification catalog out of src/lib/data/certifications.ts and into
-- the database.
--
-- It lived in code because 28 rows of reference data that change once a year buy
-- more from type safety and git history than from a table. Four things flipped
-- that, and each one is a column or a policy below:
--
--   1. a non-technical person needs to fix a wrong price  -> editable rows + a
--      select-only RLS policy, so the Supabase dashboard is the edit surface
--   2. the catalog grows past ~100 entries                -> search_text, so
--      filtering happens in Postgres instead of in a JS array
--   3. per-cert verified dates and provenance             -> verified_at,
--      verified_by, replacing one global CATALOG_VERIFIED constant
--   4. users report wrong data                            -> certification_reports
--
-- Baseline is ../schema.sql. Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The catalog
-- ---------------------------------------------------------------------------
create table if not exists public.certifications (
  id text primary key,
  name text not null,
  short_name text not null,
  provider text not null,
  category text not null check (category in (
    'cloud', 'ai', 'cybersecurity', 'networking',
    'programming', 'data', 'project-management', 'devops'
  )),
  description text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced', 'expert')),

  estimated_study_hours integer not null check (estimated_study_hours > 0),
  exam_cost numeric(10, 2) not null check (exam_cost >= 0),
  exam_cost_currency text not null default 'USD',
  exam_duration integer not null check (exam_duration > 0),
  number_of_questions integer not null check (number_of_questions > 0),
  passing_score integer not null check (passing_score between 0 and 100),

  languages text[] not null default '{}',
  remote_testing boolean not null default true,
  prerequisites text[] not null default '{}',
  career_opportunities jsonb not null default '[]'::jsonb,
  skills_gained text[] not null default '{}',
  official_url text not null check (official_url like 'http%'),
  tags text[] not null default '{}',
  trending boolean not null default false,
  free boolean not null default false,

  -- Provenance. Was a single CATALOG_VERIFIED constant covering all 28 rows at
  -- once, which meant re-checking one price implied re-checking every price.
  -- Per-row, so the certification page can admit exactly how stale IT is.
  -- official_url is the source: no provider publishes a catalog API, so every
  -- one of these was read off a page by a person.
  verified_at date not null default current_date,
  verified_by text,

  -- Maintained by trigger, not `generated always as`: array_to_string is STABLE
  -- rather than IMMUTABLE (its result depends on the element type's output
  -- function), and Postgres rejects a non-immutable generation expression.
  search_text text,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- The catalog's old JS search matched substrings inside skills_gained and tags,
-- not just whole elements, so a plain PostgREST `cs` filter would quietly narrow
-- results. Flattening to one text column keeps that behaviour as a single ilike.
create or replace function public.certification_search_text()
returns trigger language plpgsql as $$
begin
  new.search_text := concat_ws(' ',
    new.name, new.short_name, new.provider, new.category,
    array_to_string(new.skills_gained, ' '),
    array_to_string(new.tags, ' ')
  );
  return new;
end;
$$;

drop trigger if exists on_certification_search_text on public.certifications;
create trigger on_certification_search_text
  before insert or update on public.certifications
  for each row execute procedure public.certification_search_text();

drop trigger if exists on_certification_updated on public.certifications;
create trigger on_certification_updated
  before update on public.certifications
  for each row execute procedure public.handle_updated_at();

-- ponytail: no index. `ilike '%q%'` seq-scans 28 rows in microseconds. Past a
-- few thousand rows, add: create extension pg_trgm; create index on
-- public.certifications using gin (search_text gin_trgm_ops);
create index if not exists certifications_category_idx on public.certifications (category);

alter table public.certifications enable row level security;

-- `using (true)` was a privacy bug on profiles. Here it is the point: this is a
-- public reference catalog and the landing page links straight into it while
-- signed out. The distinction is that the table holds no user data.
drop policy if exists "Certifications are viewable by everyone." on public.certifications;
create policy "Certifications are viewable by everyone." on public.certifications
  for select using (true);

-- No insert/update/delete policy on purpose. RLS denies what it does not permit,
-- so the anon and authenticated keys can read the catalog and nothing more. The
-- Supabase dashboard uses the service_role key, which bypasses RLS — that is the
-- edit surface for a non-technical person, and it needs no app code.

-- ---------------------------------------------------------------------------
-- 2. Corrections from users
-- ---------------------------------------------------------------------------
create table if not exists public.certification_reports (
  id uuid default uuid_generate_v4() primary key,
  certification_id text references public.certifications(id) on delete cascade not null,

  -- set null, not cascade: a correction outlives the account that sent it.
  -- Deleting a user should not silently un-report a wrong price.
  user_id uuid references public.profiles(id) on delete set null,

  field text not null check (field in (
    'exam_cost', 'study_hours', 'exam_details', 'prerequisites', 'url', 'other'
  )),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists certification_reports_open_idx
  on public.certification_reports (status, created_at desc);

alter table public.certification_reports enable row level security;

-- Sign-in required. An anonymous endpoint that writes rows is a spam target, and
-- auth.uid() = user_id makes the author unforgeable rather than self-declared.
drop policy if exists "Users can report a certification." on public.certification_reports;
create policy "Users can report a certification." on public.certification_reports
  for insert with check (auth.uid() = user_id);

-- Own reports only. Reports quote a user's own words back at them; they are not
-- public comments, and nothing in the app reads another user's.
drop policy if exists "Users can view own reports." on public.certification_reports;
create policy "Users can view own reports." on public.certification_reports
  for select using (auth.uid() = user_id);

-- No update/delete policy: a user cannot rewrite a report after sending it, and
-- triage happens in the dashboard under service_role.

-- ---------------------------------------------------------------------------
-- 3. Seed
-- ---------------------------------------------------------------------------
-- 28 rows, generated from src/lib/data/certifications.ts
-- Idempotent: re-running restores the shipped catalog values.
insert into public.certifications (id, name, short_name, provider, category, description, difficulty, estimated_study_hours, exam_cost, exam_cost_currency, exam_duration, number_of_questions, passing_score, languages, remote_testing, prerequisites, career_opportunities, skills_gained, official_url, tags, trending, free)
values
  ('aws-saa', 'AWS Solutions Architect – Associate', 'AWS SAA-C03', 'Amazon Web Services', 'cloud', 'Validate your ability to design and implement distributed systems on AWS. This certification demonstrates your expertise in designing cost-optimized, high-performing, secure, and resilient architectures on AWS.', 'intermediate', 120, 150, 'USD', 130, 65, 72, array['English', 'Japanese', 'Korean', 'Chinese']::text[], true, array['1+ year hands-on AWS experience recommended']::text[], '[{"title":"Cloud Architect","salaryMin":120000,"salaryMax":180000,"currency":"USD"},{"title":"Solutions Architect","salaryMin":130000,"salaryMax":190000,"currency":"USD"},{"title":"Cloud Engineer","salaryMin":100000,"salaryMax":150000,"currency":"USD"}]'::jsonb, array['EC2', 'S3', 'VPC', 'IAM', 'Lambda', 'RDS', 'DynamoDB', 'CloudFormation', 'High Availability', 'Cost Optimization']::text[], 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', array['popular', 'high-salary']::text[], true, false),
  ('aws-dva', 'AWS Developer – Associate', 'AWS DVA-C02', 'Amazon Web Services', 'cloud', 'Prove your proficiency in developing and maintaining applications on AWS. Covers core AWS services, architecture best practices, and the ability to develop, deploy, and debug cloud-based applications.', 'intermediate', 100, 150, 'USD', 130, 65, 72, array['English', 'Japanese', 'Korean', 'Chinese']::text[], true, array['1+ year AWS development experience recommended']::text[], '[{"title":"Cloud Developer","salaryMin":100000,"salaryMax":160000,"currency":"USD"},{"title":"Backend Engineer","salaryMin":110000,"salaryMax":170000,"currency":"USD"}]'::jsonb, array['Lambda', 'API Gateway', 'DynamoDB', 'S3', 'SQS', 'SNS', 'CloudFormation', 'CI/CD', 'Serverless']::text[], 'https://aws.amazon.com/certification/certified-developer-associate/', array['popular']::text[], false, false),
  ('aws-sap', 'AWS Solutions Architect – Professional', 'AWS SAP-C02', 'Amazon Web Services', 'cloud', 'The most prestigious AWS certification. Validates advanced technical skills and experience in designing distributed applications and systems on the AWS platform.', 'expert', 200, 300, 'USD', 180, 75, 75, array['English', 'Japanese', 'Korean']::text[], true, array['AWS Solutions Architect Associate', '2+ years hands-on experience']::text[], '[{"title":"Principal Cloud Architect","salaryMin":160000,"salaryMax":250000,"currency":"USD"},{"title":"Cloud Consultant","salaryMin":150000,"salaryMax":220000,"currency":"USD"}]'::jsonb, array['Multi-Account Strategy', 'Hybrid Architecture', 'Migration', 'Cost Control', 'Advanced Networking', 'Security Architecture']::text[], 'https://aws.amazon.com/certification/certified-solutions-architect-professional/', array['high-salary', 'expert']::text[], false, false),
  ('az-900', 'Microsoft Azure Fundamentals', 'AZ-900', 'Microsoft', 'cloud', 'Entry-level certification that validates foundational knowledge of cloud concepts, Azure services, security, privacy, compliance, and Azure pricing and support.', 'beginner', 40, 99, 'USD', 65, 50, 70, array['English', 'Japanese', 'Chinese', 'Korean', 'French', 'German', 'Spanish', 'Arabic']::text[], true, '{}'::text[], '[{"title":"Cloud Support Engineer","salaryMin":60000,"salaryMax":90000,"currency":"USD"},{"title":"IT Administrator","salaryMin":55000,"salaryMax":85000,"currency":"USD"}]'::jsonb, array['Cloud Concepts', 'Azure Services', 'Azure Pricing', 'SLA', 'Lifecycle', 'Compliance']::text[], 'https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/', array['beginner-friendly', 'free-resources']::text[], false, false),
  ('az-104', 'Microsoft Azure Administrator', 'AZ-104', 'Microsoft', 'cloud', 'Validate your skills in implementing, managing, and monitoring Azure environments. Covers identity, governance, storage, compute, and virtual networking.', 'intermediate', 120, 165, 'USD', 120, 55, 70, array['English', 'Japanese', 'Chinese', 'Korean', 'French', 'German', 'Spanish']::text[], true, array['AZ-900 recommended', '6+ months Azure admin experience']::text[], '[{"title":"Azure Administrator","salaryMin":90000,"salaryMax":140000,"currency":"USD"},{"title":"Cloud Engineer","salaryMin":100000,"salaryMax":150000,"currency":"USD"}]'::jsonb, array['Azure AD', 'Virtual Networks', 'Storage', 'Compute', 'Monitoring', 'Backup & Recovery']::text[], 'https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/', array['popular']::text[], true, false),
  ('az-305', 'Microsoft Azure Solutions Architect Expert', 'AZ-305', 'Microsoft', 'cloud', 'Expert-level certification for designing solutions on Azure. Covers identity, governance, data storage, business continuity, and infrastructure solutions.', 'advanced', 160, 165, 'USD', 120, 50, 70, array['English', 'Japanese', 'Chinese', 'Korean']::text[], true, array['AZ-104', 'Experience with Azure administration']::text[], '[{"title":"Azure Solutions Architect","salaryMin":140000,"salaryMax":200000,"currency":"USD"},{"title":"Senior Cloud Engineer","salaryMin":130000,"salaryMax":190000,"currency":"USD"}]'::jsonb, array['Solution Design', 'Identity Architecture', 'Data Platform', 'Infrastructure', 'Business Continuity', 'Governance']::text[], 'https://learn.microsoft.com/en-us/credentials/certifications/azure-solutions-architect/', array['high-salary', 'expert']::text[], false, false),
  ('gcp-ace', 'Google Cloud Associate Cloud Engineer', 'GCP ACE', 'Google Cloud', 'cloud', 'Demonstrates ability to deploy applications, monitor operations, and manage enterprise solutions on Google Cloud Platform.', 'intermediate', 100, 200, 'USD', 120, 50, 70, array['English', 'Japanese']::text[], true, array['6+ months GCP experience recommended']::text[], '[{"title":"Cloud Engineer","salaryMin":100000,"salaryMax":155000,"currency":"USD"},{"title":"DevOps Engineer","salaryMin":110000,"salaryMax":160000,"currency":"USD"}]'::jsonb, array['Compute Engine', 'Kubernetes Engine', 'Cloud Storage', 'BigQuery', 'IAM', 'Networking']::text[], 'https://cloud.google.com/learn/certification/cloud-engineer', array['popular']::text[], false, false),
  ('gcp-pca', 'Google Cloud Professional Cloud Architect', 'GCP PCA', 'Google Cloud', 'cloud', 'Professional-level certification validating the ability to design, develop, and manage robust, secure, scalable, highly available, and dynamic solutions on Google Cloud.', 'advanced', 160, 200, 'USD', 120, 50, 70, array['English', 'Japanese']::text[], true, array['3+ years industry experience', '1+ year GCP experience']::text[], '[{"title":"Cloud Architect","salaryMin":150000,"salaryMax":220000,"currency":"USD"},{"title":"Principal Engineer","salaryMin":160000,"salaryMax":240000,"currency":"USD"}]'::jsonb, array['Solution Design', 'Security', 'Compliance', 'Reliability', 'Migration Planning', 'Business Processes']::text[], 'https://cloud.google.com/learn/certification/cloud-architect', array['high-salary']::text[], false, false),
  ('comptia-security-plus', 'CompTIA Security+', 'Security+', 'CompTIA', 'cybersecurity', 'The globally recognized certification for validating foundational, vendor-neutral IT security knowledge and skills. Ideal for IT security professionals starting their career.', 'intermediate', 90, 392, 'USD', 90, 90, 75, array['English', 'Japanese', 'Portuguese']::text[], true, array['CompTIA Network+ recommended', '2 years IT experience']::text[], '[{"title":"Security Analyst","salaryMin":80000,"salaryMax":120000,"currency":"USD"},{"title":"Security Engineer","salaryMin":95000,"salaryMax":145000,"currency":"USD"},{"title":"SOC Analyst","salaryMin":65000,"salaryMax":100000,"currency":"USD"}]'::jsonb, array['Threat Analysis', 'Risk Management', 'Cryptography', 'Identity Management', 'Network Security', 'Incident Response']::text[], 'https://www.comptia.org/certifications/security', array['popular', 'dod-approved']::text[], true, false),
  ('comptia-cysa-plus', 'CompTIA CySA+', 'CySA+', 'CompTIA', 'cybersecurity', 'Advanced cybersecurity analyst certification. Validates skills in threat detection, data analysis, vulnerability management, and security operations.', 'advanced', 140, 392, 'USD', 165, 85, 75, array['English', 'Japanese']::text[], true, array['Security+', '4 years security experience']::text[], '[{"title":"Cybersecurity Analyst","salaryMin":95000,"salaryMax":140000,"currency":"USD"},{"title":"Threat Hunter","salaryMin":110000,"salaryMax":160000,"currency":"USD"}]'::jsonb, array['Threat Detection', 'SIEM', 'Vulnerability Management', 'Incident Response', 'Forensics', 'Compliance']::text[], 'https://www.comptia.org/certifications/cybersecurity-analyst', array['advanced']::text[], false, false),
  ('comptia-network-plus', 'CompTIA Network+', 'Network+', 'CompTIA', 'networking', 'Validates the essential knowledge and skills needed to confidently design, configure, manage, and troubleshoot any wired and wireless network.', 'intermediate', 80, 358, 'USD', 90, 90, 72, array['English', 'Japanese', 'German']::text[], true, array['CompTIA A+ recommended']::text[], '[{"title":"Network Administrator","salaryMin":60000,"salaryMax":95000,"currency":"USD"},{"title":"Network Engineer","salaryMin":75000,"salaryMax":120000,"currency":"USD"}]'::jsonb, array['Network Architecture', 'Network Operations', 'Network Security', 'Troubleshooting', 'Wireless', 'Cloud Networking']::text[], 'https://www.comptia.org/certifications/network', array['foundational']::text[], false, false),
  ('cisco-ccna', 'Cisco CCNA', 'CCNA 200-301', 'Cisco', 'networking', 'The gold standard networking certification. Covers network fundamentals, IP connectivity, security fundamentals, automation, and programmability.', 'intermediate', 140, 330, 'USD', 120, 100, 82, array['English', 'Japanese']::text[], true, array['1+ year networking experience recommended']::text[], '[{"title":"Network Engineer","salaryMin":75000,"salaryMax":120000,"currency":"USD"},{"title":"Network Administrator","salaryMin":65000,"salaryMax":100000,"currency":"USD"},{"title":"Systems Engineer","salaryMin":80000,"salaryMax":130000,"currency":"USD"}]'::jsonb, array['Routing', 'Switching', 'IP Services', 'Security Fundamentals', 'Automation', 'Wireless']::text[], 'https://www.cisco.com/site/us/en/learn/training-certifications/certifications/enterprise/ccna/index.html', array['popular', 'industry-standard']::text[], true, false),
  ('ai-900', 'Microsoft Azure AI Fundamentals', 'AI-900', 'Microsoft', 'ai', 'Foundational certification demonstrating knowledge of machine learning and AI concepts, and related Microsoft Azure services.', 'beginner', 35, 99, 'USD', 65, 45, 70, array['English', 'Japanese', 'Chinese', 'Korean', 'French', 'German', 'Spanish', 'Arabic']::text[], true, '{}'::text[], '[{"title":"AI Developer","salaryMin":80000,"salaryMax":130000,"currency":"USD"},{"title":"Data Analyst","salaryMin":65000,"salaryMax":100000,"currency":"USD"}]'::jsonb, array['AI Workloads', 'ML Principles', 'Computer Vision', 'NLP', 'Generative AI', 'Azure AI Services']::text[], 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-fundamentals/', array['beginner-friendly', 'free-resources']::text[], false, false),
  ('ai-102', 'Microsoft Azure AI Engineer Associate', 'AI-102', 'Microsoft', 'ai', 'Associate-level certification for building AI solutions using Azure Cognitive Services, Azure Bot Service, and Azure Cognitive Search.', 'advanced', 130, 165, 'USD', 120, 55, 70, array['English', 'Japanese', 'Chinese', 'Korean']::text[], true, array['AI-900 recommended', 'Python/C# experience']::text[], '[{"title":"AI Engineer","salaryMin":120000,"salaryMax":180000,"currency":"USD"},{"title":"ML Engineer","salaryMin":130000,"salaryMax":200000,"currency":"USD"}]'::jsonb, array['Azure Cognitive Services', 'Computer Vision', 'NLP', 'Knowledge Mining', 'Conversational AI', 'Azure OpenAI Service']::text[], 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-engineer/', array['high-salary']::text[], true, false),
  ('tf-developer', 'TensorFlow Developer Certificate', 'TF Developer', 'Google', 'ai', 'Demonstrates proficiency in using TensorFlow to develop and train ML models. Covers neural networks, image classification, NLP, and time series forecasting.', 'intermediate', 100, 100, 'USD', 300, 5, 90, array['English']::text[], true, array['Python proficiency', 'ML fundamentals knowledge']::text[], '[{"title":"ML Engineer","salaryMin":120000,"salaryMax":190000,"currency":"USD"},{"title":"AI Research Engineer","salaryMin":140000,"salaryMax":220000,"currency":"USD"}]'::jsonb, array['TensorFlow', 'Neural Networks', 'CNNs', 'RNNs', 'NLP', 'Time Series', 'Transfer Learning']::text[], 'https://www.tensorflow.org/certificate', array['hands-on', 'practical']::text[], false, false),
  ('aws-ml-specialty', 'AWS Machine Learning – Specialty', 'AWS MLS-C01', 'Amazon Web Services', 'ai', 'Specialty certification for professionals who perform ML/deep learning workloads on AWS. Covers data engineering, exploratory data analysis, modeling, and ML implementation.', 'advanced', 160, 300, 'USD', 180, 65, 75, array['English', 'Japanese', 'Korean']::text[], true, array['2+ years ML experience', 'AWS Associate certification recommended']::text[], '[{"title":"ML Engineer","salaryMin":140000,"salaryMax":210000,"currency":"USD"},{"title":"Data Scientist","salaryMin":130000,"salaryMax":200000,"currency":"USD"}]'::jsonb, array['SageMaker', 'Data Engineering', 'Feature Engineering', 'Model Training', 'ML Operations', 'Deployment']::text[], 'https://aws.amazon.com/certification/certified-machine-learning-specialty/', array['high-salary', 'specialty']::text[], false, false),
  ('pmp', 'Project Management Professional', 'PMP', 'PMI', 'project-management', 'The gold standard in project management certification. Recognized worldwide, the PMP validates your competence to lead and direct projects.', 'advanced', 200, 555, 'USD', 230, 180, 60, array['English', 'Japanese', 'Chinese', 'Korean', 'French', 'German', 'Spanish', 'Arabic', 'Portuguese']::text[], true, array['35 hours PM education', '3-5 years project leadership experience']::text[], '[{"title":"Project Manager","salaryMin":95000,"salaryMax":150000,"currency":"USD"},{"title":"Program Manager","salaryMin":120000,"salaryMax":180000,"currency":"USD"},{"title":"Portfolio Manager","salaryMin":140000,"salaryMax":200000,"currency":"USD"}]'::jsonb, array['Agile', 'Predictive PM', 'Stakeholder Management', 'Risk Management', 'Budgeting', 'Leadership']::text[], 'https://www.pmi.org/certifications/project-management-pmp', array['popular', 'high-salary', 'industry-standard']::text[], true, false),
  ('capm', 'Certified Associate in Project Management', 'CAPM', 'PMI', 'project-management', 'Entry-level project management certification that demonstrates your understanding of fundamental project management concepts, processes, and terminology.', 'beginner', 60, 300, 'USD', 180, 150, 60, array['English', 'Japanese', 'Chinese', 'Korean', 'Spanish', 'Portuguese']::text[], true, array['23 hours PM education']::text[], '[{"title":"Junior Project Manager","salaryMin":55000,"salaryMax":80000,"currency":"USD"},{"title":"Project Coordinator","salaryMin":50000,"salaryMax":75000,"currency":"USD"}]'::jsonb, array['PM Fundamentals', 'Project Lifecycle', 'Scope Management', 'Schedule Management', 'Cost Management']::text[], 'https://www.pmi.org/certifications/certified-associate-capm', array['beginner-friendly']::text[], false, false),
  ('psm-1', 'Professional Scrum Master I', 'PSM I', 'Scrum.org', 'project-management', 'Validates your knowledge of Scrum framework, Scrum Master accountabilities, and how to apply Scrum. Globally recognized agile certification.', 'intermediate', 50, 200, 'USD', 60, 80, 85, array['English']::text[], true, '{}'::text[], '[{"title":"Scrum Master","salaryMin":90000,"salaryMax":140000,"currency":"USD"},{"title":"Agile Coach","salaryMin":110000,"salaryMax":170000,"currency":"USD"}]'::jsonb, array['Scrum Framework', 'Sprint Planning', 'Retrospectives', 'Servant Leadership', 'Agile Principles', 'Team Facilitation']::text[], 'https://www.scrum.org/assessments/professional-scrum-master-i-certification', array['popular', 'agile']::text[], false, false),
  ('cka', 'Certified Kubernetes Administrator', 'CKA', 'CNCF', 'devops', 'Performance-based certification that demonstrates competency in Kubernetes administration. Covers cluster architecture, workloads, networking, storage, and troubleshooting.', 'advanced', 120, 395, 'USD', 120, 17, 66, array['English', 'Japanese', 'Chinese']::text[], true, array['Linux command line proficiency', 'Container basics']::text[], '[{"title":"Kubernetes Administrator","salaryMin":110000,"salaryMax":170000,"currency":"USD"},{"title":"Platform Engineer","salaryMin":130000,"salaryMax":190000,"currency":"USD"}]'::jsonb, array['Cluster Setup', 'Workload Management', 'Networking', 'Storage', 'Security', 'Troubleshooting']::text[], 'https://www.cncf.io/certification/cka/', array['hands-on', 'performance-based']::text[], true, false),
  ('ckad', 'Certified Kubernetes Application Developer', 'CKAD', 'CNCF', 'devops', 'Validates skills in designing, building, configuring, and exposing cloud native applications for Kubernetes.', 'intermediate', 80, 395, 'USD', 120, 16, 66, array['English', 'Japanese', 'Chinese']::text[], true, array['Container fundamentals', 'Basic Kubernetes knowledge']::text[], '[{"title":"Cloud Native Developer","salaryMin":100000,"salaryMax":160000,"currency":"USD"},{"title":"DevOps Engineer","salaryMin":110000,"salaryMax":170000,"currency":"USD"}]'::jsonb, array['Pod Design', 'Configuration', 'Multi-Container Pods', 'Observability', 'Services & Networking', 'State Persistence']::text[], 'https://www.cncf.io/certification/ckad/', array['hands-on', 'performance-based']::text[], false, false),
  ('terraform-associate', 'HashiCorp Terraform Associate', 'Terraform Associate', 'HashiCorp', 'devops', 'Validates foundational knowledge of Infrastructure as Code concepts using Terraform. Covers Terraform CLI, state, modules, and workflow.', 'intermediate', 60, 70, 'USD', 60, 57, 70, array['English']::text[], true, array['Basic cloud infrastructure knowledge']::text[], '[{"title":"Infrastructure Engineer","salaryMin":100000,"salaryMax":155000,"currency":"USD"},{"title":"DevOps Engineer","salaryMin":110000,"salaryMax":165000,"currency":"USD"}]'::jsonb, array['HCL', 'Terraform CLI', 'State Management', 'Modules', 'Providers', 'Terraform Cloud']::text[], 'https://www.hashicorp.com/certification/terraform-associate', array['affordable', 'iac']::text[], false, false),
  ('pcep', 'PCEP – Certified Entry-Level Python Programmer', 'PCEP', 'Python Institute', 'programming', 'Entry-level certification validating foundational Python programming skills. Covers data types, control flow, data collections, functions, and basic OOP.', 'beginner', 40, 59, 'USD', 40, 30, 70, array['English']::text[], true, '{}'::text[], '[{"title":"Junior Python Developer","salaryMin":55000,"salaryMax":80000,"currency":"USD"},{"title":"QA Automation Engineer","salaryMin":60000,"salaryMax":90000,"currency":"USD"}]'::jsonb, array['Python Syntax', 'Data Types', 'Control Flow', 'Functions', 'Data Collections', 'Basic I/O']::text[], 'https://pythoninstitute.org/pcep', array['beginner-friendly', 'affordable']::text[], false, false),
  ('pcap', 'PCAP – Certified Associate in Python Programming', 'PCAP', 'Python Institute', 'programming', 'Associate-level certification covering intermediate Python concepts including OOP, modules, packages, exception handling, and file processing.', 'intermediate', 70, 295, 'USD', 65, 40, 70, array['English']::text[], true, array['PCEP recommended']::text[], '[{"title":"Python Developer","salaryMin":80000,"salaryMax":130000,"currency":"USD"},{"title":"Data Analyst","salaryMin":70000,"salaryMax":110000,"currency":"USD"}]'::jsonb, array['OOP', 'Modules & Packages', 'Exception Handling', 'File Processing', 'Generators', 'List Comprehensions']::text[], 'https://pythoninstitute.org/pcap', array['intermediate']::text[], false, false),
  ('comptia-a-plus', 'CompTIA A+', 'A+', 'CompTIA', 'networking', 'The industry standard for establishing a career in IT. Covers hardware, software, networking, security, and troubleshooting fundamentals.', 'beginner', 120, 358, 'USD', 90, 90, 70, array['English', 'Japanese', 'German']::text[], true, '{}'::text[], '[{"title":"IT Support Technician","salaryMin":40000,"salaryMax":65000,"currency":"USD"},{"title":"Help Desk Analyst","salaryMin":42000,"salaryMax":60000,"currency":"USD"},{"title":"Desktop Support","salaryMin":45000,"salaryMax":70000,"currency":"USD"}]'::jsonb, array['Hardware', 'Software', 'Networking', 'Mobile Devices', 'Troubleshooting', 'Security Basics', 'OS Installation']::text[], 'https://www.comptia.org/certifications/a', array['beginner-friendly', 'foundational']::text[], false, false),
  ('gcp-pde', 'Google Cloud Professional Data Engineer', 'GCP PDE', 'Google Cloud', 'data', 'Professional certification for designing, building, and operationalizing data processing systems on Google Cloud. Covers data pipelines, ML models, and data governance.', 'advanced', 150, 200, 'USD', 120, 50, 70, array['English', 'Japanese']::text[], true, array['3+ years industry experience', '1+ year GCP experience']::text[], '[{"title":"Data Engineer","salaryMin":120000,"salaryMax":180000,"currency":"USD"},{"title":"Senior Data Engineer","salaryMin":150000,"salaryMax":210000,"currency":"USD"}]'::jsonb, array['BigQuery', 'Dataflow', 'Pub/Sub', 'Dataproc', 'Data Pipelines', 'ML Integration']::text[], 'https://cloud.google.com/learn/certification/data-engineer', array['high-salary', 'data']::text[], false, false),
  ('aws-soa', 'AWS SysOps Administrator – Associate', 'AWS SOA-C02', 'Amazon Web Services', 'cloud', 'Validates technical expertise in deployment, management, and operations on the AWS platform. Covers monitoring, high availability, and security management.', 'intermediate', 100, 150, 'USD', 180, 65, 72, array['English', 'Japanese', 'Korean']::text[], true, array['1 year AWS operations experience']::text[], '[{"title":"SysOps Administrator","salaryMin":85000,"salaryMax":130000,"currency":"USD"},{"title":"Cloud Operations Engineer","salaryMin":90000,"salaryMax":140000,"currency":"USD"}]'::jsonb, array['CloudWatch', 'Systems Manager', 'Auto Scaling', 'Elastic Load Balancing', 'Backup', 'Cost Management']::text[], 'https://aws.amazon.com/certification/certified-sysops-admin-associate/', array['operations']::text[], false, false),
  ('lpic-1', 'LPIC-1: Linux Administrator', 'LPIC-1', 'LPI', 'devops', 'First certification in the LPI multi-level professional program. Validates ability to perform maintenance tasks on the command line, install and configure a Linux computer, and configure basic networking.', 'intermediate', 90, 200, 'USD', 90, 60, 50, array['English', 'Japanese', 'German', 'Portuguese', 'Spanish']::text[], true, '{}'::text[], '[{"title":"Linux Administrator","salaryMin":70000,"salaryMax":110000,"currency":"USD"},{"title":"Systems Administrator","salaryMin":75000,"salaryMax":120000,"currency":"USD"}]'::jsonb, array['System Architecture', 'Linux Installation', 'Package Management', 'GNU Commands', 'Shells & Scripting', 'Networking Fundamentals']::text[], 'https://www.lpi.org/our-certifications/lpic-1-overview', array['linux', 'foundational']::text[], false, false)
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  provider = excluded.provider,
  category = excluded.category,
  description = excluded.description,
  difficulty = excluded.difficulty,
  estimated_study_hours = excluded.estimated_study_hours,
  exam_cost = excluded.exam_cost,
  exam_cost_currency = excluded.exam_cost_currency,
  exam_duration = excluded.exam_duration,
  number_of_questions = excluded.number_of_questions,
  passing_score = excluded.passing_score,
  languages = excluded.languages,
  remote_testing = excluded.remote_testing,
  prerequisites = excluded.prerequisites,
  career_opportunities = excluded.career_opportunities,
  skills_gained = excluded.skills_gained,
  official_url = excluded.official_url,
  tags = excluded.tags,
  trending = excluded.trending,
  free = excluded.free;

-- The catalog was last checked against the providers' own pages on this date.
-- Set per-row from here on: re-checking one price no longer implies the rest.
update public.certifications set verified_at = '2026-07-17', verified_by = 'catalog import';
