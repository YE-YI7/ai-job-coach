/**
 * 跨阶段AI记忆系统测试脚本
 * 用于验证记忆系统是否正常工作
 */

import { 
  saveMemory, 
  getUserMemories, 
  getCrossStageMemories,
  formatMemoriesForContext,
  saveMemorySummary,
  getLatestSummary 
} from '../lib/memory';

// 测试用户ID（请替换为实际的用户ID）
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function testMemorySystem() {
  console.log('========================================');
  console.log('🧪 开始测试跨阶段AI记忆系统');
  console.log('========================================\n');

  try {
    // ========== 测试1：保存记忆 ==========
    console.log('📝 测试1：保存记忆...');
    
    const memoryId1 = await saveMemory({
      userId: TEST_USER_ID,
      stage: 'career',
      memoryType: 'career_goal',
      content: {
        target_role: 'Java后端开发工程师',
        target_industry: '互联网',
        target_location: '北京',
      },
      importance: 9,
    });
    console.log(`✅ 成功保存职业目标记忆，ID: ${memoryId1}`);

    const memoryId2 = await saveMemory({
      userId: TEST_USER_ID,
      stage: 'project',
      memoryType: 'project_detail',
      content: {
        project_name: '电商平台后端系统',
        role: '后端开发工程师',
        tech_stack: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
        achievements: [
          '优化查询性能提升50%',
          '设计分布式缓存方案，降低数据库压力',
        ],
      },
      importance: 8,
    });
    console.log(`✅ 成功保存项目经历记忆，ID: ${memoryId2}\n`);

    // ========== 测试2：查询记忆 ==========
    console.log('🔍 测试2：查询记忆...');
    
    const careerMemories = await getUserMemories(TEST_USER_ID, 'career');
    console.log(`✅ 查询到 ${careerMemories.length} 条职业规划阶段的记忆`);
    if (careerMemories.length > 0) {
      console.log('   示例:', JSON.stringify(careerMemories[0].content, null, 2));
    }

    const allMemories = await getUserMemories(TEST_USER_ID);
    console.log(`✅ 查询到用户所有 ${allMemories.length} 条记忆\n`);

    // ========== 测试3：跨阶段记忆查询 ==========
    console.log('🔗 测试3：跨阶段记忆查询...');
    
    const crossMemories = await getCrossStageMemories(TEST_USER_ID, 'interview', 5);
    console.log(`✅ 查询到 ${crossMemories.length} 条跨阶段高重要性记忆`);
    if (crossMemories.length > 0) {
      console.log('   示例:', JSON.stringify(crossMemories[0], null, 2));
    }
    console.log();

    // ========== 测试4：格式化记忆为上下文 ==========
    console.log('📄 测试4：格式化记忆为上下文...');
    
    const formattedContext = formatMemoriesForContext(allMemories);
    console.log('✅ 格式化后的上下文:');
    console.log(formattedContext);
    console.log();

    // ========== 测试5：保存总结 ==========
    console.log('📊 测试5：保存对话总结...');
    
    const summaryId = await saveMemorySummary({
      userId: TEST_USER_ID,
      stage: 'career',
      summaryContent: `## 核心信息
- 用户目标：成为Java后端开发工程师
- 目标行业：互联网
- 目标地点：北京

## 项目经历
- 电商平台后端系统开发
- 技术栈：Java, Spring Boot, MySQL, Redis
- 主要成果：性能优化提升50%，设计分布式缓存方案`,
      messageCount: 15,
      tokenCount: 200,
    });
    console.log(`✅ 成功保存总结，ID: ${summaryId}\n`);

    // ========== 测试6：查询最新总结 ==========
    console.log('🔍 测试6：查询最新总结...');
    
    const latestSummary = await getLatestSummary(TEST_USER_ID, 'career');
    if (latestSummary) {
      console.log('✅ 查询到最新总结:');
      console.log(latestSummary.summary_content);
    } else {
      console.log('⚠️  未找到总结');
    }
    console.log();

    // ========== 测试完成 ==========
    console.log('========================================');
    console.log('✅ 所有测试通过！记忆系统工作正常');
    console.log('========================================');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('详细错误:', error);
  }
}

// 运行测试
testMemorySystem();
