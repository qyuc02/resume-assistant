import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const utilUrl = moduleUrl(compile('../src/util.ts'));
const { captureResume, changeStage, localDate } = await import(moduleUrl(compile('../src/tracker.ts').replace(/(['"])\.\/util\1/g, JSON.stringify(utilUrl))));
const data = {
  personalInfo: {}, directions: [], applications: [],
  categories: [{ id: 'c', name: '项目经历', order: 0 }],
  entries: [{ id: 'e', categoryId: 'c', title: '项目', role: '开发', bullets: ['原始事实'], tags: [], variants: [{ id: 'v', directionId: 'd', title: '项目', role: '开发', bullets: ['方向事实'], tags: [] }] }],
  resumes: [{ id: 'r', name: '投递版', personalInfo: { name: '测试', summary: '原始简介' }, summaryOverride: '定制简介', sections: [{ categoryId: 'c', entryIds: ['e'] }], directionId: 'd', overrides: { e: { bullets: ['已确认的定制事实'] } } }],
};
const record = { id: 'a', stage: '待投递', appliedDate: '', resumeId: 'r', history: [] };
const submitted = changeStage(record, '已投递', data);
assert.equal(submitted.appliedDate, localDate());
assert.equal(submitted.snapshot.entries[0].bullets[0], '已确认的定制事实');
assert.equal(submitted.snapshot.resume.personalInfo.summary, '定制简介');
assert.equal(submitted.snapshot.resume.directionId, '');
assert.deepEqual(submitted.snapshot.resume.overrides, {});
assert.equal(record.stage, '待投递');
assert.equal(record.history.length, 0);
data.entries[0].bullets[0] = '后来改了素材';
data.resumes[0].overrides.e.bullets[0] = '后来改了简历';
data.categories[0].name = '后来改了模块';
assert.equal(submitted.snapshot.entries[0].bullets[0], '已确认的定制事实');
assert.equal(submitted.snapshot.categories[0].name, '项目经历');
const interview = changeStage(submitted, '一面', data);
assert.equal(interview.snapshot, submitted.snapshot);
assert.equal(interview.history.length, 2);
assert.equal(changeStage(interview, '一面', data), interview);
assert.equal(changeStage(record, '已结束', data).appliedDate, '');
assert.equal(captureResume(data, 'missing'), undefined);
assert.equal(localDate(new Date(2026, 9, 11, 1)), '2026-10-11');
const require = createRequire(import.meta.url);
const storeCode = compile('../src/store.tsx').replace(/(['"])\.\/util\1/g, JSON.stringify(utilUrl)).replace(/(['"])react\1/g, JSON.stringify(pathToFileURL(require.resolve('react')).href));
const { migrate } = await import(moduleUrl(storeCode));
const legacy = { personalInfo: { name: '已有姓名' }, categories: [], entries: [], resumes: [{ id: 'old', name: '已有简历', personalInfo: {}, sections: [], updatedAt: 1 }] };
const migrated = migrate(legacy);
assert.deepEqual(migrated.applications, []);
assert.equal(migrated.personalInfo.name, '已有姓名');
assert.equal(migrated.resumes[0].name, '已有简历');
assert.equal(legacy.applications, undefined);
console.log('投递流程检查通过：日期、阶段记录、原对象隔离、快照隔离、缺失简历处理。');
console.log('旧版数据迁移检查通过：保留简历与姓名，补齐投递记录。');

// 回归：投递记录/经历缺字段时不能崩溃（旧版数据升级场景）
const legacyFull = {
  personalInfo: {},
  categories: [{ id: 'c1', name: '实习经历', order: 0 }],
  entries: [{ id: 'e1', categoryId: 'c1', title: '某公司' }], // 缺 role/startDate/endDate/location/bullets/tags
  resumes: [{ id: 'r1', name: '旧简历', sections: [{ categoryId: 'c1' }], updatedAt: 1 }], // section 缺 entryIds
  applications: [{ id: 'a1', company: '腾讯', position: '后端', stage: '已投递' }], // 缺 scheduleAt/history/resumeId 等
};
const m2 = migrate(legacyFull);
const app = m2.applications[0];
assert.equal(app.scheduleAt, '');
assert.deepEqual(app.history, []);
assert.equal(app.resumeId, '');
assert.equal(typeof app.createdAt, 'number');
assert.equal(typeof app.archived, 'boolean');
assert.equal(app.priority, '普通');
const entry = m2.entries[0];
assert.equal(entry.role, '');
assert.equal(entry.startDate, '');
assert.equal(entry.location, '');
assert.deepEqual(entry.bullets, []);
assert.deepEqual(entry.tags, []);
assert.deepEqual(m2.resumes[0].sections[0].entryIds, []);
assert.ok(m2.resumes[0].personalInfo && typeof m2.resumes[0].personalInfo.name === 'string');
// 关键：字段齐全，TracerView 里的 scheduleAt.replace / [...history] 不再抛错
assert.doesNotThrow(() => app.scheduleAt.replace('T', ' '));
assert.doesNotThrow(() => [...app.history].reverse());
console.log('缺字段旧数据迁移检查通过：投递记录与经历字段全部补齐，不再崩溃。');
