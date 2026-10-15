import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CombSchema } from '../dist/schemas/comb.schema.js';
for (const name of ['static-nginx','php-nginx','nodejs']) {
 test(`${name} supports managed Docker users and assigned HTTP ports`, () => {
 const input=JSON.parse(fs.readFileSync(new URL(`../src/data/combs/web/${name}.json`,import.meta.url),'utf8'));
 const comb=CombSchema.parse(input);
 assert.equal(comb.shell,'sh');assert.equal(comb.environment.PORT,'{{allocation.port}}');assert.equal(comb.working_dir,'/home/container');
 assert.deepEqual(comb.stop,{command:'',timeout:30,signal:'SIGTERM'});
 assert.ok(comb.install.some(step=>step.type==='write_file'));
 if(name==='php-nginx'){assert.equal(comb.startup,'/usr/local/bin/hive-web');assert.ok(comb.docker_images['PHP 8.4 · Nginx']);assert.equal(comb.variables.document_root,'public');}
 if(name==='static-nginx'){const script=comb.install.find(step=>step.with.target==='web-start.sh').with.content;assert.match(script,/listen \$PORT/);assert.match(script,/nginx -c \/tmp\/hive-web\/nginx.conf/);assert.doesNotMatch(script,/listen 80;/);}
 if(name==='nodejs'){assert.match(comb.install.find(step=>step.with.target==='index.js').with.content,/process.env.PORT/);}
 });
}
test('unsupported shells and dangerous shutdown commands are rejected',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('../src/data/combs/web/nodejs.json',import.meta.url),'utf8'));
 assert.equal(CombSchema.safeParse({...input,shell:'../../bin/sh'}).success,false);
 assert.equal(CombSchema.safeParse({...input,stop:{command:'stop\nquit',timeout:30,signal:'SIGTERM'}}).success,false);
});

test('Comb recommendations survive catalogue validation and invalid limits are rejected',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('../src/data/combs/web/static-nginx.json',import.meta.url),'utf8'));
 assert.deepEqual(CombSchema.parse(input).recommended_resources,{memory_mb:128,disk_mb:1024,cpu_percent:25});
 for(const recommended_resources of [{memory_mb:-1},{cpu_percent:1001},{io_weight:0},{unknown:100}]) {
  assert.equal(CombSchema.safeParse({...input,recommended_resources}).success,false);
 }
});

test('static Nginx overrides every module temporary directory for non-root startup',()=>{
 const comb=JSON.parse(fs.readFileSync(new URL('../src/data/combs/web/static-nginx.json',import.meta.url),'utf8'));
 const script=comb.install.find(step=>step.with.target==='web-start.sh').with.content;
 for(const directive of ['client_body_temp_path','proxy_temp_path','fastcgi_temp_path','uwsgi_temp_path','scgi_temp_path']) assert.ok(script.includes(`${directive} /tmp/hive-web/`),directive);
});
