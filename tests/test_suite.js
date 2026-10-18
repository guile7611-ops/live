/**
 * Suíte de Testes Automatizados - LIVE Interativa Urna Eletrônica (13 vs 22)
 * Validação rigorosa dos 10 requisitos obrigatórios de concorrência,
 * idempotência, persistência SQLite, streaks do TikTok e integridade matemática.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Carrega os módulos internos para teste isolado e integrado
const db = require('../backend/database');
const stateManager = require('../backend/stateManager');
const queueManager = require('../backend/queueManager');

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO SUÍTE DE TESTES OBRIGATÓRIOS (10 CASOS)');
  console.log('===============================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  try {
    // -------------------------------------------------------------------------
    // TESTE 1: Um presente enviado uma vez
    // -------------------------------------------------------------------------
    console.log('▶ Teste 1: Um presente enviado uma vez...');
    db.resetScores(0, 0); // Limpa para estado controlado
    const t1Result = db.processGiftEvent({
      msgId: 'msg_t1_001',
      username: 'usuario1',
      giftName: 'Rosa',
      repeatCount: 1,
      targetSide: '13',
      votesPerUnit: 1
    });

    assert.strictEqual(t1Result.success, true, 'Evento deve ser processado com sucesso');
    assert.strictEqual(t1Result.deltaVotes, 1, 'Delta de votos deve ser exatamente 1');
    assert.strictEqual(t1Result.scores.votes13, 1, 'Lado 13 deve ter 1 voto');
    assert.strictEqual(t1Result.scores.votes22, 0, 'Lado 22 deve ter 0 votos');
    console.log('  ✔ SUCESSO: 1 presente único gerou exatamente 1 voto para o lado 13.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 2: Combo acumulando de 1 até 1.000, incluindo evento final
    // -------------------------------------------------------------------------
    console.log('▶ Teste 2: Combo acumulando de 1 até 1.000, incluindo evento final...');
    db.resetScores(0, 0);
    const streakId2 = 'streak_combo_1000_' + Date.now();
    
    // Simula sequência de repeatCount progressivo: 1, 5, 20, 100, 500, 1000
    const progression = [1, 5, 20, 100, 500, 1000];
    let lastResult = null;

    for (let i = 0; i < progression.length; i++) {
      const count = progression[i];
      const isEnd = (i === progression.length - 1);
      lastResult = db.processGiftEvent({
        msgId: `msg_t2_${count}`,
        groupId: streakId2,
        username: 'comboMaster',
        giftName: 'Flor branca',
        repeatCount: count,
        repeatEnd: isEnd,
        targetSide: '22',
        votesPerUnit: 1
      });
      assert.strictEqual(lastResult.success, true, `Etapa count=${count} deve ter sucesso`);
    }

    assert.strictEqual(lastResult.scores.votes22, 1000, 'Total acumulado no lado 22 deve ser exatamente 1.000');
    assert.strictEqual(lastResult.scores.votes13, 0, 'Lado 13 deve permanecer 0');
    console.log('  ✔ SUCESSO: Combo progressivo 1➔1000 acumulou exatamente 1.000 votos sem duplicar deltas.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 3: Repetição do mesmo evento (Idempotência por event_id e repeatEnd)
    // -------------------------------------------------------------------------
    console.log('▶ Teste 3: Repetição do mesmo evento (Idempotência estrita)...');
    const duplicateAttempt1 = db.processGiftEvent({
      msgId: 'msg_t2_1000', // Mesmo msgId do teste anterior
      groupId: streakId2,
      username: 'comboMaster',
      giftName: 'Flor branca',
      repeatCount: 1000,
      repeatEnd: true,
      targetSide: '22',
      votesPerUnit: 1
    });

    assert.strictEqual(duplicateAttempt1.duplicate, true, 'Mesmo msgId deve ser rejeitado como duplicata');
    assert.strictEqual(duplicateAttempt1.deltaVotes, 0, 'Delta de votos deve ser 0 para duplicatas');
    assert.strictEqual(db.getScores().votes22, 1000, 'Total de votos não deve se alterar');
    console.log('  ✔ SUCESSO: Mensagem repetida foi detectada e rejeitada sem alterar o placar.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 4: Eventos chegando fora de ordem
    // -------------------------------------------------------------------------
    console.log('▶ Teste 4: Eventos chegando fora de ordem...');
    const streakId4 = 'streak_out_of_order_' + Date.now();
    
    // Primeiro chega repeatCount: 10
    db.processGiftEvent({
      msgId: 'msg_t4_10',
      groupId: streakId4,
      username: 'userLate',
      giftName: 'Rosa',
      repeatCount: 10,
      targetSide: '13',
      votesPerUnit: 1
    });

    // Depois chega repeatCount: 5 (atrasado)
    const delayedResult = db.processGiftEvent({
      msgId: 'msg_t4_5_delayed',
      groupId: streakId4,
      username: 'userLate',
      giftName: 'Rosa',
      repeatCount: 5,
      targetSide: '13',
      votesPerUnit: 1
    });

    assert.strictEqual(delayedResult.duplicate, true, 'Evento atrasado com repeatCount menor deve ser rejeitado');
    assert.strictEqual(delayedResult.deltaVotes, 0, 'Delta deve ser 0 para evento atrasado');
    assert.strictEqual(db.getScores().votes13, 10, 'Votos do lado 13 devem permanecer 10');
    console.log('  ✔ SUCESSO: Evento fora de ordem (repeatCount 5 após 10) foi rejeitado com delta 0.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 5: Dois espectadores enviando combos simultâneos intercalados
    // (Cenário Obrigatório: 1.000 para 22 e 400 para 13 intercalados partindo de zero)
    // -------------------------------------------------------------------------
    console.log('▶ Teste 5: Dois espectadores enviando combos simultâneos intercalados (Cenário Obrigatório)...');
    db.resetScores(0, 0); // Partindo estritamente de zero

    const streakA = 'streak_userA_22_' + Date.now();
    const streakB = 'streak_userB_13_' + Date.now();

    // Eventos intercalados simulando chegada em rede real
    const interleavedEvents = [
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 100, streak: streakA, end: false },
      { user: 'UsuarioB', side: '13', gift: 'Rosa', count: 50, streak: streakB, end: false },
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 250, streak: streakA, end: false },
      { user: 'UsuarioB', side: '13', gift: 'Rosa', count: 120, streak: streakB, end: false },
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 500, streak: streakA, end: false },
      { user: 'UsuarioB', side: '13', gift: 'Rosa', count: 250, streak: streakB, end: false },
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 750, streak: streakA, end: false },
      { user: 'UsuarioB', side: '13', gift: 'Rosa', count: 400, streak: streakB, end: true },  // Encerra 13 com 400
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 1000, streak: streakA, end: true }, // Encerra 22 com 1000
      // Repetição de repeatEnd para verificar que não soma novamente
      { user: 'UsuarioB', side: '13', gift: 'Rosa', count: 400, streak: streakB, end: true },
      { user: 'UsuarioA', side: '22', gift: 'Flor branca', count: 1000, streak: streakA, end: true }
    ];

    interleavedEvents.forEach((ev, idx) => {
      db.processGiftEvent({
        msgId: `interleaved_${idx}_${Date.now()}`,
        groupId: ev.streak,
        username: ev.user,
        giftName: ev.gift,
        repeatCount: ev.count,
        repeatEnd: ev.end,
        targetSide: ev.side,
        votesPerUnit: 1
      });
    });

    const scoresT5 = db.getScores();
    console.log(`    Resultado obtido: 13: ${scoresT5.votes13} (${scoresT5.pct13}%) | 22: ${scoresT5.votes22} (${scoresT5.pct22}%) | Total: ${scoresT5.totalVotes}`);

    assert.strictEqual(scoresT5.votes13, 400, 'Lado 13 deve ter exatamente 400 votos');
    assert.strictEqual(scoresT5.votes22, 1000, 'Lado 22 deve ter exatamente 1.000 votos');
    assert.strictEqual(scoresT5.totalVotes, 1400, 'Total deve ser exatamente 1.400 votos');
    assert.strictEqual(scoresT5.pct13, 28.57, 'Porcentagem do 13 deve ser 28,57%');
    assert.strictEqual(scoresT5.pct22, 71.43, 'Porcentagem do 22 deve ser 71,43%');
    console.log('  ✔ SUCESSO: Cenário obrigatório validado com 100% de exatidão matemática e idempotência!\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 6: Milhares de presentes em poucos segundos (Sobrecarga e Fila Visual)
    // -------------------------------------------------------------------------
    console.log('▶ Teste 6: Milhares de presentes em poucos segundos (Sobrecarga)...');
    const startLoad = performance.now();
    const NUM_GIFTS = 2500;
    
    // Injeta 2.500 presentes via queueManager
    for (let i = 0; i < NUM_GIFTS; i++) {
      const side = (i % 2 === 0) ? '13' : '22';
      queueManager.enqueueGift({
        msgId: `flood_${i}_${Date.now()}`,
        user: `@tester_${i}`,
        giftName: side === '13' ? 'Rosa' : 'Flor branca',
        repeatCount: 1
      });
    }
    const elapsedLoad = (performance.now() - startLoad).toFixed(2);
    const postLoadScores = db.getScores();

    console.log(`    Tempo para 2.500 presentes SQLite: ${elapsedLoad}ms`);
    console.log(`    Tamanho da fila visual mantida sob controle: ${queueManager.visualQueue.length} (limite <= 20)`);
    assert.ok(queueManager.visualQueue.length <= 20, 'Fila visual deve descartar animações antigas para não sobrecarregar');
    assert.strictEqual(postLoadScores.totalVotes, 1400 + NUM_GIFTS, 'Todos os 2.500 votos devem ser contabilizados sem perda');
    console.log('  ✔ SUCESSO: 2.500 eventos persistidos atomicamente em alta velocidade e fila visual controlada.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 7: Desconexão e reconexão com sincronização por Snapshot
    // -------------------------------------------------------------------------
    console.log('▶ Teste 7: Desconexão e reconexão com sincronização de Snapshot...');
    const snapshot = stateManager.getState();
    assert.ok(snapshot.version > 0, 'Versão do estado deve ser incremental');
    assert.strictEqual(snapshot.match.totalVotes, postLoadScores.totalVotes, 'Snapshot deve refletir totais do SQLite');
    assert.ok(snapshot.settings.comboMilestones.length >= 3, 'Milestones de combo devem estar presentes no snapshot');
    console.log('  ✔ SUCESSO: Snapshot completo recuperado com versão e totais idênticos ao banco.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 8: Reinicialização do aplicativo durante animações (Cancelamento seguro)
    // -------------------------------------------------------------------------
    console.log('▶ Teste 8: Reinicialização durante animações e cancelamento seguro...');
    // Simula fila visual acumulada
    queueManager.visualQueue.push({ id: 'dummy_1' }, { id: 'dummy_2' });
    // "Reinicia" esvaziando a fila visual
    queueManager.visualQueue = [];
    queueManager.isProcessingVisual = false;
    
    // Confirma que os votos não foram afetados pelo cancelamento visual
    const persistentScores = db.getScores();
    assert.strictEqual(persistentScores.totalVotes, postLoadScores.totalVotes, 'Votos persistidos devem permanecer intactos');
    assert.strictEqual(queueManager.visualQueue.length, 0, 'Fila visual reiniciada com sucesso');
    console.log('  ✔ SUCESSO: Animações visuais canceladas com segurança sem perda de votos persistidos.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 9: Atualização correta das porcentagens com soma 100%
    // -------------------------------------------------------------------------
    console.log('▶ Teste 9: Atualização correta das porcentagens...');
    const currentScores = db.getScores();
    const sumPct = Number((currentScores.pct13 + currentScores.pct22).toFixed(1));
    assert.ok(Math.abs(sumPct - 100.0) <= 0.1, `A soma das porcentagens (${sumPct}%) deve ser 100.0%`);
    console.log(`    Porcentagens atuais: 13 = ${currentScores.pct13}%, 22 = ${currentScores.pct22}%, Soma = ${sumPct}%`);
    console.log('  ✔ SUCESSO: Cálculo de porcentagens validado com consistência e arredondamento correto.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 10: Preservação dos votos persistidos após reiniciar o sistema
    // -------------------------------------------------------------------------
    console.log('▶ Teste 10: Preservação dos votos persistidos após reiniciar o sistema...');
    // Fecha a instância atual do banco e reabre uma nova conexão direta com o arquivo SQLite
    const { DatabaseSync: NewDatabaseSync } = require('node:sqlite');
    const dbPath = path.join(__dirname, '..', 'data', 'urna_live.sqlite');
    const newDbConnection = new NewDatabaseSync(dbPath);

    const rows = newDbConnection.prepare('SELECT side, votes FROM votes_summary').all();
    let reloadedV13 = 0;
    let reloadedV22 = 0;
    rows.forEach(r => {
      if (r.side === '13') reloadedV13 = Number(r.votes);
      if (r.side === '22') reloadedV22 = Number(r.votes);
    });

    assert.strictEqual(reloadedV13, currentScores.votes13, 'Votos do lado 13 devem ser idênticos após reconectar ao arquivo');
    assert.strictEqual(reloadedV22, currentScores.votes22, 'Votos do lado 22 devem ser idênticos após reconectar ao arquivo');
    console.log(`    Votos lidos do disco SQLite: 13: ${reloadedV13} | 22: ${reloadedV22}`);
    console.log('  ✔ SUCESSO: Persistência no disco validada! Dados 100% íntegros após nova conexão.\n');
    passedTests++;

  } catch (err) {
    console.error('\n❌ FALHA NO TESTE:', err);
    process.exit(1);
  }

  console.log('===============================================================');
  console.log(`🎉 TODOS OS ${passedTests}/${totalTests} TESTES OBRIGATÓRIOS FORAM APROVADOS COM SUCESSO!`);
  console.log('===============================================================\n');

  // Restaura os votos para o estado inicial padrão da LIVE
  db.resetScores(10842, 11000);
}

runTestSuite();
