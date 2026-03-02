import { collection, writeBatch, doc, getDocs, query, where } from 'firebase/firestore';

/**
 * Função para gerar UID único e consistente
 * Baseado na lógica legado do Apps Script
 */
const generateId = (nome, dataNascimento) => {
    const rawId = `${nome.trim().toUpperCase()}${dataNascimento}`;
    return btoa(rawId).substring(0, 30); // Limita a 30 caracteres para segurança no Firebase ID
};

/**
 * Motor de Reconciliação do Censo utilizando XLSX e Firestore Batch
 * 
 * @param {Array} jsonData Array de objetos extraídos da planilha XLSX.
 * @param {Object} db Instância do Firestore configurada.
 * @returns {Object} { updated: number, created: number, discharged: number }
 */
export const processExcelUpload = async (jsonData, db) => {
    try {
        const batch = writeBatch(db);
        const pacientesRef = collection(db, 'gestaoFluxo_pacientes');

        // 1. Busca todos os pacientes ATIVOS ou SINALIZADOS no banco
        const activeQuery = query(pacientesRef, where('status', 'in', ['ATIVO', 'SINALIZADA']));
        const querySnapshot = await getDocs(activeQuery);

        const pacientesMap = new Map();
        querySnapshot.forEach((docSnap) => {
            pacientesMap.set(docSnap.id, { ...docSnap.data(), ref: docSnap.ref });
        });

        const currentXlsxUids = new Set();
        const stats = { updated: 0, created: 0, discharged: 0 };
        const now = new Date();

        // 2. Itera sobre os dados do XLSX
        jsonData.forEach((row, index) => {
            if (index === 0 && Object.keys(row)[0].toLowerCase().includes('prontuário')) return; // Pula cabeçalho se houver

            const nome = row['Nome'] || row['NOME'] || '';
            const nascimento = row['DataNascimento'] || row['Data Nascimento'] || row['DATA DE NASCIMENTO'] || '';
            const setor = row['Setor'] || row['SETOR'] || '';
            const leito = row['Leito'] || row['LEITO'] || '';
            const especialidade = row['Especialidade'] || row['ESPECIALIDADE'] || '';
            const sexo = row['Sexo'] || row['SEXO'] || '';
            const dataInternacao = row['DataInternacao'] || row['DATA DE INTERNAÇÃO'] || now.toISOString();

            if (!nome) return; // Proteção contra linhas vazias

            const uid = generateId(nome, nascimento);
            currentXlsxUids.add(uid);
            const docRef = doc(pacientesRef, uid);

            if (pacientesMap.has(uid)) {
                // Paciente existe: Atualiza dados voláteis (Setor, Leito, etc)
                batch.update(docRef, {
                    setor: setor,
                    leito: leito,
                    especialidade: especialidade,
                    status: 'ATIVO',
                    ultimaSinc: now
                });
                stats.updated++;
            } else {
                // Paciente novo: Cria
                batch.set(docRef, {
                    nome: nome.toUpperCase(),
                    nascimento: nascimento,
                    sexo: sexo,
                    dataInternacao: dataInternacao,
                    setor: setor,
                    leito: leito,
                    especialidade: especialidade,
                    status: 'ATIVO',
                    numeroSisreg: '',
                    historico: [],
                    ultimaSinc: now,
                    dataEntrada: now
                });
                stats.created++;
            }
        });

        // 3. Processa altas (Discharged)
        // Se o paciente está no banco como ATIVO mas não veio neste XLSX, ele teve alta/foi transferido.
        pacientesMap.forEach((patientData, uid) => {
            if (!currentXlsxUids.has(uid)) {
                batch.update(patientData.ref, {
                    status: 'ALTA',
                    dataAlta: now,
                    ultimaSinc: now
                });
                stats.discharged++;
            }
        });

        // 4. Executa o Commit das operações (WriteBatch)
        await batch.commit();
        return stats;

    } catch (error) {
        console.error("Erro no SyncEngine:", error);
        throw error;
    }
};
