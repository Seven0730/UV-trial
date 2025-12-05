#include "xatlas_wrapper.h"
#include <xatlas.h>
#include <vector>
#include <iostream>
#include <map>

namespace UVUnwrapping {

class XAtlasWrapper::Impl {
public:
    xatlas::Atlas* atlas_ = nullptr;
    
    ~Impl() {
        if (atlas_) {
            xatlas::Destroy(atlas_);
        }
    }
};

XAtlasWrapper::XAtlasWrapper() : impl_(new Impl()) {
    impl_->atlas_ = xatlas::Create();
}

XAtlasWrapper::~XAtlasWrapper() {
    delete impl_;
}

std::pair<Eigen::MatrixXd, std::vector<UVIsland>> XAtlasWrapper::generate(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Options& options
) {
    // 重新创建 atlas（清空之前的状态）
    if (impl_->atlas_) {
        xatlas::Destroy(impl_->atlas_);
    }
    impl_->atlas_ = xatlas::Create();
    
    // 准备输入网格 - xatlas 需要 float 类型的顶点数据
    std::vector<float> vertices(V.size());
    for (int i = 0; i < V.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            vertices[i * 3 + j] = static_cast<float>(V(i, j));
        }
    }
    
    xatlas::MeshDecl mesh_decl;
    mesh_decl.vertexCount = V.rows();
    mesh_decl.vertexPositionData = vertices.data();
    mesh_decl.vertexPositionStride = sizeof(float) * 3;
    
    mesh_decl.indexCount = F.size();
    mesh_decl.faceCount = F.rows();
    
    // xatlas 需要 uint32_t 索引
    std::vector<uint32_t> indices(F.size());
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            indices[i * 3 + j] = F(i, j);
        }
    }
    mesh_decl.indexData = indices.data();
    mesh_decl.indexFormat = xatlas::IndexFormat::UInt32;
    
    // 添加网格
    xatlas::AddMeshError error = xatlas::AddMesh(impl_->atlas_, mesh_decl);
    if (error != xatlas::AddMeshError::Success) {
        std::cerr << "xatlas: Failed to add mesh: " << xatlas::StringForEnum(error) << std::endl;
        return {Eigen::MatrixXd(), {}};
    }
    
    // 设置参数
    xatlas::ChartOptions chart_options;
    chart_options.maxChartArea = options.max_chart_area;
    chart_options.maxBoundaryLength = options.max_boundary_length;
    chart_options.normalDeviationWeight = options.normal_deviation_weight;
    chart_options.roundnessWeight = options.roundness_weight;
    chart_options.straightnessWeight = options.straightness_weight;
    chart_options.normalSeamWeight = options.normal_seam_weight;
    chart_options.textureSeamWeight = options.texture_seam_weight;
    chart_options.maxCost = options.max_cost;
    chart_options.maxIterations = options.max_iterations;
    
    xatlas::PackOptions pack_options;
    pack_options.resolution = options.resolution;
    pack_options.padding = (int)options.padding;
    pack_options.bilinear = options.bilinear;
    pack_options.blockAlign = options.block_align;
    pack_options.bruteForce = options.brute_force;
    pack_options.maxChartSize = options.max_charts_per_atlas;
    
    // 生成 atlas
    xatlas::Generate(impl_->atlas_, chart_options, pack_options);
    
    // 检查是否有输出
    if (impl_->atlas_->meshCount == 0) {
        std::cerr << "xatlas: No meshes generated" << std::endl;
        return {Eigen::MatrixXd(), {}};
    }
    
    // 提取结果
    const xatlas::Mesh& output_mesh = impl_->atlas_->meshes[0];
    
    // 调试输出
    std::cout << "xatlas debug: vertexCount=" << output_mesh.vertexCount 
              << ", chartCount=" << output_mesh.chartCount 
              << ", atlasWidth=" << impl_->atlas_->width 
              << ", atlasHeight=" << impl_->atlas_->height << std::endl;
    
    // 创建 UV 坐标
    Eigen::MatrixXd UV(output_mesh.vertexCount, 2);
    for (uint32_t i = 0; i < output_mesh.vertexCount; ++i) {
        const xatlas::Vertex& v = output_mesh.vertexArray[i];
        UV(i, 0) = v.uv[0] / impl_->atlas_->width;
        UV(i, 1) = v.uv[1] / impl_->atlas_->height;
    }
    
    // 提取 UV 岛信息（按 chart 分组）
    std::vector<UVIsland> islands;
    std::map<uint32_t, std::vector<int>> chart_to_faces;
    
    // 遍历所有 chart
    for (uint32_t c = 0; c < output_mesh.chartCount; ++c) {
        const xatlas::Chart& chart = output_mesh.chartArray[c];
        UVIsland island;
        
        // 收集属于这个 chart 的面
        for (uint32_t f = 0; f < chart.faceCount; ++f) {
            island.faces.push_back(chart.faceArray[f]);
        }
        
        // 计算质心和面积（简化）
        island.centroid = Eigen::Vector3d::Zero();
        island.area = 0.0;
        
        islands.push_back(island);
    }
    
    return {UV, islands};
}

std::pair<Eigen::MatrixXd, std::vector<UVIsland>> XAtlasWrapper::generate(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F
) {
    Options default_options;
    return generate(V, F, default_options);
}

std::pair<Eigen::MatrixXd, std::vector<UVIsland>> XAtlasWrapper::repack(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::MatrixXd& UV,
    const Options& options
) {
    // 准备输入网格（带 UV）
    xatlas::MeshDecl mesh_decl;
    mesh_decl.vertexCount = V.rows();
    mesh_decl.vertexPositionData = V.data();
    mesh_decl.vertexPositionStride = sizeof(double) * 3;
    
    mesh_decl.vertexUvData = UV.data();
    mesh_decl.vertexUvStride = sizeof(double) * 2;
    
    mesh_decl.indexCount = F.size();
    
    std::vector<uint32_t> indices(F.size());
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            indices[i * 3 + j] = F(i, j);
        }
    }
    mesh_decl.indexData = indices.data();
    mesh_decl.indexFormat = xatlas::IndexFormat::UInt32;
    
    xatlas::AddMesh(impl_->atlas_, mesh_decl);
    
    // 只进行打包，不重新生成 charts
    xatlas::PackOptions pack_options;
    pack_options.resolution = options.resolution;
    pack_options.padding = (int)options.padding;
    pack_options.bilinear = options.bilinear;
    pack_options.blockAlign = options.block_align;
    pack_options.bruteForce = options.brute_force;
    
    xatlas::Generate(impl_->atlas_, xatlas::ChartOptions(), pack_options);
    
    // 提取结果
    const xatlas::Mesh& output_mesh = impl_->atlas_->meshes[0];
    
    Eigen::MatrixXd UV_new(output_mesh.vertexCount, 2);
    for (uint32_t i = 0; i < output_mesh.vertexCount; ++i) {
        const xatlas::Vertex& v = output_mesh.vertexArray[i];
        UV_new(i, 0) = v.uv[0] / impl_->atlas_->width;
        UV_new(i, 1) = v.uv[1] / impl_->atlas_->height;
    }
    
    return {UV_new, {}};
}

} // namespace UVUnwrapping
