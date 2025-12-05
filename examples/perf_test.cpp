#include <iostream>
#include <igl/read_triangle_mesh.h>
#include <chrono>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj>\n";
        return 1;
    }

    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    auto start = std::chrono::high_resolution_clock::now();
    
    std::cout << "加载网格: " << argv[1] << "\n";
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格\n";
        return 1;
    }
    
    auto after_load = std::chrono::high_resolution_clock::now();
    std::cout << "网格: " << V.rows() << " 顶点, " << F.rows() << " 面\n";
    std::cout << "加载时间: " 
              << std::chrono::duration_cast<std::chrono::milliseconds>(after_load - start).count() 
              << " ms\n\n";
    
    // 测试1：简单的顶点访问
    std::cout << "测试1: 遍历所有顶点...\n";
    start = std::chrono::high_resolution_clock::now();
    double sum = 0;
    for (int i = 0; i < V.rows(); ++i) {
        sum += V(i, 0);
    }
    auto end = std::chrono::high_resolution_clock::now();
    std::cout << "  耗时: " << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count() << " ms\n";
    std::cout << "  校验和: " << sum << "\n\n";
    
    // 测试2：边构建
    std::cout << "测试2: 构建边集合...\n";
    start = std::chrono::high_resolution_clock::now();
    
    struct PairHash {
        size_t operator()(const std::pair<int,int>& p) const {
            return std::hash<long long>()(((long long)p.first << 32) | p.second);
        }
    };
    std::unordered_map<std::pair<int,int>, int, PairHash> edges;
    edges.reserve(F.rows() * 3);
    
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            if (v0 > v1) std::swap(v0, v1);
            edges[{v0, v1}]++;
        }
    }
    
    end = std::chrono::high_resolution_clock::now();
    std::cout << "  耗时: " << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count() << " ms\n";
    std::cout << "  边数: " << edges.size() << "\n\n";
    
    // 测试3：对称平面分类
    std::cout << "测试3: 对称平面分类 (x=0)...\n";
    start = std::chrono::high_resolution_clock::now();
    
    std::vector<int> side(V.rows());
    const double tolerance = 0.01;
    for (int i = 0; i < V.rows(); ++i) {
        double dist = V(i, 0);  // x坐标
        side[i] = (std::abs(dist) < tolerance) ? 0 : ((dist > 0) ? 1 : -1);
    }
    
    end = std::chrono::high_resolution_clock::now();
    std::cout << "  耗时: " << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count() << " ms\n";
    
    int neg = 0, zero = 0, pos = 0;
    for (int s : side) {
        if (s < 0) neg++;
        else if (s == 0) zero++;
        else pos++;
    }
    std::cout << "  负侧: " << neg << ", 平面上: " << zero << ", 正侧: " << pos << "\n\n";
    
    std::cout << "性能分析完成！\n";
    std::cout << "结论: 如果测试1-3都很快，问题在segmentByEdgeLoops的BFS遍历\n";
    
    return 0;
}
