const test=require('node:test');
const assert=require('node:assert/strict');
const {validPhone,validEmail,validateReport}=require('../.test-build/validation.js');
const {countRecoveredItems}=require('../.test-build/statistics.js');
test('Bangladesh phone formats are validated',()=>{assert.equal(validPhone('01712345678'),true);assert.equal(validPhone('+8801712345678'),true);assert.equal(validPhone('01712'),false);});
test('university emails only',()=>{assert.equal(validEmail('student@seu.edu.bd'),true);assert.equal(validEmail('student@gmail.com'),false);});
test('invalid report date and fields are rejected',()=>{const report={type:'lost',title:'x',category:'Phone',brand:'',color:'',location:'a',occurredOn:'3026-01-01',description:'short',contactPhone:'xx'};assert.ok(validateReport(report).length>=4);});
test('paired reports returned are counted as one recovery',()=>{const reports=[{id:'a',status:'returned'},{id:'b',status:'returned'},{id:'c',status:'returned'}];const claims=[{reportId:'a',relatedReportId:'b',status:'completed'}];assert.equal(countRecoveredItems(reports,claims),2);});

test('ID card reports cannot include a public photo',()=>{const report={type:'found',title:'Student ID Card',category:'ID Card',brand:'',color:'',location:'Library',occurredOn:'2026-11-05',description:'Found a student ID card near the library',contactPhone:'01712345678',image:'data:image/jpeg;base64,abc'};assert.ok(validateReport(report).some((issue)=>issue.includes('ID Card')));});
