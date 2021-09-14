/**
 code to test modifying existing files in repo, commiting and 
 pushing to new branch based off of variable input
 */
const github = require('@actions/github');
const fs = require('fs').promises;
const { promisify } = require('util');
const glob = promisify(require('glob'));
const Promise = require('bluebird');
const path = require('path');

const owner = 'niehusstaab';
const repo = 'ocotokit-rest.js-test'; // sad purposeful typo

const octo = github.getOctokit(process.env.GH_API_TOKEN).rest;

async function main() {
  const base = 'rc';
  const newBranchName = 'misc/updated-files';
  const isAndroid = false;
  let filesToCommit;

  // get sha of base branch so we can branch off it for new branch
  const { data: branchRefData } = await octo.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  })
  const baseBranchSha = branchRefData.object.sha

  // create new branch to add changes to and make PR from
  await octo.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranchName}`,
    sha: baseBranchSha,
  });
  
  // clone repo from new branch for changes to be made
  // pseudo code
  // await exec(`git clone --depth 1 --branch ${newBranchName} https://git.ssh/owner/repo.git`);

  // make some dummy changes on new branch
  if (isAndroid) {
    await fs.appendFile(path.join(__dirname, '../dummyData/android/strings.xml'), 'appended data');
    await fs.appendFile(path.join(__dirname, '../dummyData/android/plurals.xml'), 'appended data');
    filesToCommit = ['**/*.xml'];
  } else {
    await fs.appendFile(path.join(__dirname, '../dummyData/ios/Localizable.strings'), 'appended data');
    await fs.appendFile(path.join(__dirname, '../dummyData/ios/Localizable.stringsdict'), 'appended data');
    filesToCommit = ['**/*.strings', '**/*.stringsdict'];
  }

  // get current commit on new branch head
  const { data: refData } = await octo.git.getRef({
    owner,
    repo,
    ref: `heads/${newBranchName}`,
  })
  const commitSha = refData.object.sha
  const { data: commitData } = await octo.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  })
  const currentCommit = {
    commitSha,
    treeSha: commitData.tree.sha,
  }

  // convert chosen files to commit into blobs for gh api
  const filesPaths = (await Promise.mapSeries(filesToCommit, async (path) => await glob(path))).flat();
  console.log(`foudn file paths: ${filesPaths}`);
  const filesBlobs = await Promise.mapSeries(filesPaths, async (filePath) => {
    // create blob for file path
    const content = await fs.readFile(filePath, 'utf8')
    const blobData = await octo.git.createBlob({
      owner,
      repo,
      content,
      encoding: 'utf-8',
    })
    return blobData.data
  });

  // put blobs into a new git tree so it can be committed
  const pathsForBlobs = filesPaths.map(fullPath => path.relative('./', fullPath))

  const tree = filesBlobs.map(({ sha }, index) => ({
    path: pathsForBlobs[index],
    mode: `100644`,
    type: `blob`,
    sha,
  }))
  const { data } = await octo.git.createTree({
    owner,
    repo,
    tree,
    base_tree: currentCommit.treeSha,
  })
  const newTree = data;

  // craete the commit
  const message = `My commit message`
  const newCommit = (await octo.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [currentCommit.commitSha],
  })).data;

  // add commit to target branch
  await octo.git.updateRef({
    owner,
    repo,
    ref: `heads/${newBranchName}`,
    sha: newCommit.sha,
  })

  // create the pr from new branch
  await octo.pulls.create({
    owner,
    repo,
    base,
    head: newBranchName,
    title: 'Bot pr',
    body: 'hello world',
    maintainer_can_modify: true,
    draft: false,
  });
} // end main


main().then(() => console.log('Done')).catch((e) => console.log(e));
